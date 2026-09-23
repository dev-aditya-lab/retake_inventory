import { z } from "zod";
import { MAX_PRODUCT_ID } from "../config/barcodeScheme";
import { SKU_CODE_PATTERN } from "../config/skuScheme";

const skuCode = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(SKU_CODE_PATTERN, "SKU code must be 2–6 letters or digits, e.g. TUR"));

const productId = z
  .number()
  .int("Barcode ID must be a whole number")
  .min(1)
  .max(MAX_PRODUCT_ID, `Barcode ID must be between 1 and ${MAX_PRODUCT_ID}`);

export const createCatalogCodeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  skuCode,
  productId,
  category: z.string().trim().max(60).optional(),
});

export const updateCatalogCodeSchema = createCatalogCodeSchema.partial();

const hsnCode = z.string().trim().regex(/^\d{4,8}$/, "HSN/SAC code must be 4–8 digits");

export const createHsnCodeSchema = z.object({
  code: hsnCode,
  description: z.string().trim().max(200).optional(),
  // null clears a previously set rate.
  gstRate: z.number().min(0).max(100).nullable().optional(),
});

export const updateHsnCodeSchema = createHsnCodeSchema.partial();
