import { z } from "zod";
import { GST_STATES, UQC_CODES, VALID_GST_RATES } from "../config/gst";

export const stateCodeSchema = z
  .string()
  .trim()
  .refine((code) => code in GST_STATES, "Choose a valid state for the place of supply");

export const gstRateSchema = z
  .number()
  .refine((rate) => (VALID_GST_RATES as readonly number[]).includes(rate), {
    message: `GST rate must be one of ${VALID_GST_RATES.join(", ")}%`,
  });

export const hsnCodeSchema = z.string().trim().regex(/^\d{4,8}$/, "HSN code must be 4 to 8 digits");

export const uqcSchema = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((code) => code in UQC_CODES, "Choose a valid unit (UQC)");

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a month like 2026-09");

export const gstPeriodRangeQuerySchema = z
  .object({ from: periodSchema, to: periodSchema.optional() })
  .refine((q) => !q.to || q.to >= q.from, { message: "The end month can't be before the start month" });

export const markFiledSchema = z.object({
  periods: z.array(periodSchema).min(1).max(3),
  arn: z.string().trim().max(40).optional(),
});

export const bulkProductGstSchema = z
  .object({
    productIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(1000),
    hsnCode: hsnCodeSchema.optional(),
    gstRate: gstRateSchema.optional(),
    uqc: uqcSchema.optional(),
  })
  .refine((v) => v.hsnCode !== undefined || v.gstRate !== undefined || v.uqc !== undefined, {
    message: "Choose an HSN code, GST rate or unit to apply",
  });
