import { Router } from "express";
import mongoose from "mongoose";
import { redis } from "../config/redis";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const mongoState = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

  let redisState = "disconnected";
  try {
    redisState = (await redis.ping()) === "PONG" ? "connected" : "disconnected";
  } catch {
    redisState = "disconnected";
  }

  res.json({
    success: true,
    service: "retake-backend",
    timestamp: new Date().toISOString(),
    dependencies: { mongodb: mongoState, redis: redisState },
  });
});
