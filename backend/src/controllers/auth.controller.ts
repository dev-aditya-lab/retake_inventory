import type { Request, Response } from "express";
import * as authService from "../services/auth.service";
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from "../utils/cookies";
import { User } from "../models/User.model";
import { ApiError } from "../utils/ApiError";
import { serializeUser } from "../utils/serializeUser";

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  const { user, accessToken, refreshToken } = await authService.login(email, password);
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
