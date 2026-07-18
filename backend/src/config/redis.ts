import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error({ err }, "Redis connection error"));

export async function connectRedis(): Promise<void> {
  // A lazyConnect client can already be mid-connect by the time this runs if
  // something on the import graph (e.g. express-rate-limit's RedisStore)
  // issued a command against it first. Only call connect() from a clean slate.
  if (redis.status === "wait") {
    await redis.connect();
    return;
  }
  if (redis.status !== "ready") {
    await new Promise<void>((resolve, reject) => {
      redis.once("ready", () => resolve());
      redis.once("error", reject);
    });
  }
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
}
