import { User, type UserRole } from "../models/User.model";
import { comparePassword, hashPassword } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { parseDurationToSeconds } from "../utils/parseDuration";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

function refreshKey(userId: string, jti: string): string {
  return `refresh:${userId}:${jti}`;
}

async function issueTokenPair(userId: string, role: UserRole) {
  const accessToken = signAccessToken({ sub: userId, role });
  const { token: refreshToken, jti } = signRefreshToken(userId);
  await redis.set(refreshKey(userId, jti), "1", "EX", parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN));
  return { accessToken, refreshToken };
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    throw ApiError.unauthorized("Invalid email or password");
  }

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

  // Rotate: invalidate the used refresh token immediately.
  await redis.del(key);

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

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
}) {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict("A user with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    role: input.role,
    passwordHash,
  });
  return user;
}
