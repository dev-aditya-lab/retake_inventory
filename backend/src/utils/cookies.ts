import type { CookieOptions, Response } from "express";
import { env } from "../config/env";
import { parseDurationToSeconds } from "./parseDuration";

const ACCESS_COOKIE = "rtk_at";
const REFRESH_COOKIE = "rtk_rt";

// Frontend (Vercel) and backend (Railway/Render) live on different domains in
// production, so cross-site cookies need SameSite=None + Secure. In local dev
// both apps are on localhost (same site, different port), where Lax works and
// Secure would block the cookie over plain http.
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookieOptions,
    maxAge: parseDurationToSeconds(env.JWT_ACCESS_EXPIRES_IN) * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookieOptions,
    maxAge: parseDurationToSeconds(env.JWT_REFRESH_EXPIRES_IN) * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, baseCookieOptions);
  res.clearCookie(REFRESH_COOKIE, baseCookieOptions);
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
