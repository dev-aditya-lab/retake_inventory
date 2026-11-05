import type { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from "../utils/cookies";
import { User } from "../models/User.model";
import { ApiError } from "../utils/ApiError";
import { serializeUser } from "../utils/serializeUser";

/** Always the same answer for a known and an unknown identifier, so it can't be used to find out who has an account. */
export async function requestOtp(req: Request, res: Response): Promise<void> {
  const { identifier } = req.body as { identifier: string };
  await authService.requestOtp(identifier);
  res.json({ success: true, data: { message: "If that matches a staff account, a code is on its way." } });
}

export async function verifyOtp(req: Request, res: Response): Promise<void> {
  const { identifier, code } = req.body as { identifier: string; code: string };
  const { user, accessToken, refreshToken } = await authService.verifyOtp(identifier, code);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ success: true, data: serializeUser(user) });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE];
  const { user, accessToken, refreshToken } = await authService.refreshSession(token);
  setAuthCookies(res, accessToken, refreshToken);
  res.json({ success: true, data: serializeUser(user) });
}

export async function logout(req: Request, res: Response): Promise<void> {
  await authService.logout(req.cookies?.[REFRESH_COOKIE]);
  clearAuthCookies(res);
  res.json({ success: true, data: null });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.user?.id);
  if (!user) {
    throw ApiError.unauthorized("Session invalid");
  }
  res.json({ success: true, data: serializeUser(user) });
}

/** A staff member edits their own name / phone. The body is already limited by updateProfileSchema. */
export async function updateMe(req: Request, res: Response): Promise<void> {
  const { name, phone } = req.body as { name?: string; phone?: string };

  // The number is how this person signs in, so it can't be shared with someone else.
  if (phone) await authService.assertPhoneAvailable(phone, req.user?.id);

  const $set: Record<string, string> = {};
  const $unset: Record<string, 1> = {};
  if (name !== undefined) $set.name = name;
  if (phone === "") $unset.phone = 1; // cleared: customers get the shop's main number instead
  else if (phone !== undefined) $set.phone = phone;

  const user = await User.findByIdAndUpdate(
    req.user?.id,
    {
      ...(Object.keys($set).length > 0 ? { $set } : {}),
      ...(Object.keys($unset).length > 0 ? { $unset } : {}),
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!user) {
    throw ApiError.unauthorized("Session invalid");
  }
  res.json({ success: true, data: serializeUser(user) });
}
