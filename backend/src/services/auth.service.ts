import { User, type UserDoc, type UserRole } from "../models/User.model";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { parseDurationToSeconds } from "../utils/parseDuration";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { ApiError } from "../utils/ApiError";
import {
  cleanCode,
  generateOtp,
  hashOtp,
  OTP_COOLDOWN_SECONDS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_HOUR,
  OTP_TTL_SECONDS,
  otpMatches,
  parseIdentifier,
} from "../utils/otp";
import { indianMobile, phoneSearchPattern } from "../utils/phone";
import { sendOtpEmail } from "./email.service";
import { sendOtpWhatsApp } from "./whatsapp.service";

/**
 * A refresh token is single-use, but the one just used stays valid for this
 * long. Requests that were in flight together (a screen polling several
 * endpoints, two tabs of the same login) all present the same old token; without
 * a grace period only the first would succeed and the others would be signed out.
 */
const ROTATION_GRACE_SECONDS = 30;

function refreshKey(userId: string, jti: string): string {
  return `refresh:${userId}:${jti}`;
}

async function issueTokenPair(userId: string, role: UserRole) {
  const accessToken = signAccessToken({ sub: userId, role });
  const { token: refreshToken, jti } = signRefreshToken(userId);
  await redis.set(refreshKey(userId, jti), "1", "EX", parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN));
  return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// Signing in with a one-time code
// ---------------------------------------------------------------------------

const otpKey = (userId: string) => `otp:code:${userId}`;
const triesKey = (userId: string) => `otp:tries:${userId}`;
const cooldownKey = (userId: string) => `otp:cool:${userId}`;
const hourKey = (userId: string) => `otp:hour:${userId}`;

const BAD_CODE = "That code is wrong or has expired. Ask for a new one.";

/**
 * The active staff member a typed identifier (email or mobile number) belongs
 * to. Phones are matched whatever format they were saved in. Null when there is
 * no such person, or the number is shared by two accounts (nobody can be sure
 * who is signing in, so no code is sent).
 */
export async function findUserByIdentifier(raw: string): Promise<UserDoc | null> {
  const identifier = parseIdentifier(raw);
  if (!identifier) return null;

  if (identifier.kind === "email") return User.findOne({ email: identifier.email, isActive: true });

  const pattern = phoneSearchPattern(identifier.national);
  if (!pattern) return null;
  const matches = await User.find({ phone: { $regex: pattern }, isActive: true }).limit(2);
  if (matches.length > 1) {
    logger.warn("Two staff accounts share a phone number; no login code was sent");
    return null;
  }
  return matches[0] ?? null;
}

/** Makes a new code for a person (replacing any earlier one) and resolves it. Only its hash is stored. */
export async function issueOtp(userId: string): Promise<string> {
  const code = generateOtp();
  await redis.set(otpKey(userId), hashOtp(code, userId, env.JWT_ACCESS_SECRET), "EX", OTP_TTL_SECONDS);
  await redis.del(triesKey(userId));
  return code;
}

/** WhatsApp first; email when WhatsApp can't (service off, template trouble, no phone on file). */
async function deliverOtp(user: UserDoc, code: string): Promise<void> {
  const national = indianMobile(user.phone);
  let whatsappError: unknown;

  if (national) {
    try {
      await sendOtpWhatsApp(national, code);
      return;
    } catch (err) {
      whatsappError = err;
      logger.warn({ err }, "Could not send a login code on WhatsApp; trying email");
    }
  }

  try {
    await sendOtpEmail(user.email, code);
  } catch (err) {
    logger.error({ err, whatsappError }, "Could not deliver a login code by WhatsApp or email");
    throw new ApiError(503, "We couldn't send the code right now. Try again in a minute, or ask an admin for help.");
  }
}

/**
 * Sends a login code to whoever the identifier belongs to. Answers the same for
 * an unknown identifier, so nobody can use it to find out who has an account.
 * Asking again within a minute, or too often in an hour, quietly does nothing:
 * the earlier code is still good.
 */
export async function requestOtp(identifier: string): Promise<void> {
  const user = await findUserByIdentifier(identifier);
  if (!user) return;

  if ((await redis.set(cooldownKey(user.id), "1", "EX", OTP_COOLDOWN_SECONDS, "NX")) !== "OK") return;
  const askedThisHour = await redis.incr(hourKey(user.id));
  if (askedThisHour === 1) await redis.expire(hourKey(user.id), 60 * 60);
  if (askedThisHour > OTP_MAX_PER_HOUR) return;

  const code = await issueOtp(user.id);
  if (env.NODE_ENV === "development") logger.info({ code, user: user.email }, "Login code (shown in development only)");

  try {
    await deliverOtp(user, code);
  } catch (err) {
    // Nothing reached them, so let them try again straight away.
    await redis.del(otpKey(user.id), cooldownKey(user.id));
    throw err;
  }
}

/** Checks a typed code. Each code works once, expires after 10 minutes, and dies after 5 wrong guesses. */
export async function verifyOtp(identifier: string, rawCode: string) {
  const user = await findUserByIdentifier(identifier);
  if (!user) throw ApiError.unauthorized(BAD_CODE);

  const stored = await redis.get(otpKey(user.id));
  if (!stored) throw ApiError.unauthorized(BAD_CODE);

  const tries = await redis.incr(triesKey(user.id));
  if (tries === 1) await redis.expire(triesKey(user.id), OTP_TTL_SECONDS);
  if (tries > OTP_MAX_ATTEMPTS) {
    await redis.del(otpKey(user.id));
    throw ApiError.unauthorized(BAD_CODE);
  }

  if (!otpMatches(cleanCode(rawCode), stored, user.id, env.JWT_ACCESS_SECRET)) throw ApiError.unauthorized(BAD_CODE);

  // Single use: if two requests present the right code together, only one gets to delete it.
  if ((await redis.del(otpKey(user.id))) === 0) throw ApiError.unauthorized(BAD_CODE);
  await redis.del(triesKey(user.id));

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokenPair(user.id, user.role as UserRole);
  return { user, ...tokens };
}

export async function refreshSession(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const key = refreshKey(payload.sub, payload.jti);
  const exists = await redis.get(key);
  if (!exists) {
    throw ApiError.unauthorized("Refresh token has been revoked");
  }

  // Rotate: the used token expires after the grace period (never extended by reuse, so a stolen
  // token can't be kept alive by repeated refreshes).
  const remaining = await redis.ttl(key);
  if (remaining < 0 || remaining > ROTATION_GRACE_SECONDS) await redis.expire(key, ROTATION_GRACE_SECONDS);

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("User no longer active");
  }

  const tokens = await issueTokenPair(user.id, user.role as UserRole);
  return { user, ...tokens };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    const payload = verifyRefreshToken(refreshToken);
    await redis.del(refreshKey(payload.sub, payload.jti));
  } catch {
    // Already invalid/expired — nothing to revoke.
  }
}

// ---------------------------------------------------------------------------
// Staff accounts
// ---------------------------------------------------------------------------

/** A mobile number belongs to one person only, because it is how they sign in. */
export async function assertPhoneAvailable(phone: string, exceptUserId?: string): Promise<void> {
  const pattern = phoneSearchPattern(phone);
  if (!pattern) return;
  const clash = await User.findOne({ phone: { $regex: pattern }, ...(exceptUserId ? { _id: { $ne: exceptUserId } } : {}) })
    .select("name")
    .lean();
  if (clash) throw ApiError.conflict(`${clash.name} already uses this mobile number`);
}

export async function createUser(input: { name: string; email: string; phone: string; role: UserRole }) {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict("A user with this email already exists");
  }
  await assertPhoneAvailable(input.phone);

  return User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    role: input.role,
  });
}
