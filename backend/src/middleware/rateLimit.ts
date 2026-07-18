import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../config/redis";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts, please try again later" },
  store: new RedisStore({
    prefix: "rl:login:",
    sendCommand: (...args: string[]) => {
      const [command, ...rest] = args as [string, ...string[]];
      return redis.call(command, ...rest) as Promise<never>;
    },
  }),
});
