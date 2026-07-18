import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import { logger } from "../config/logger";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Validation failed",
      details: flattenZodError(err),
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err }, err.message);
    }
    res.status(err.statusCode).json({ success: false, message: err.message, details: err.details });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({ success: false, message: "Internal server error" });
}

function flattenZodError(err: ZodError) {
  return err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}
