import { z } from "zod";

export const dateRangeQuerySchema = z.object({
  from: z.string().datetime().optional().or(z.string().date().optional()),
  to: z.string().datetime().optional().or(z.string().date().optional()),
});

export const salesReportQuerySchema = dateRangeQuerySchema.extend({
  period: z.enum(["daily", "monthly", "yearly"]).default("daily"),
});
