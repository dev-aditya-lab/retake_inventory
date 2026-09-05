import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis";

function redisStore(prefix: string) {
  return new RedisStore({
    prefix,
    sendCommand: (...args: string[]) => {
      const [command, ...rest] = args as [string, ...string[]];
      return redis.call(command, ...rest) as Promise<never>;
    },
  });
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts, please try again later" },
  store: redisStore("rl:login:"),
});

// Applies to every /api request. Its main job isn't per-user abuse (staff
// routes are already authenticated + role-gated) but blocking scripted
// enumeration of the public, unauthenticated invoice-lookup routes — invoice
// numbers are sequential (RTK-INV-YYMMDD-XXXX), so without this a scraper
// could walk a day's range and harvest customer names/phones/addresses.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later" },
  store: redisStore("rl:api:"),
});
