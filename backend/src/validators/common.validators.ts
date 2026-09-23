import { z } from "zod";

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Optional email field: "" (cleared) or a valid address. */
export const optionalEmailSchema = z.union([z.literal(""), z.string().trim().email("Enter a valid email")]);

/** Optional GSTIN field: "" (cleared) or 15 letters/digits, upper-cased. */
export const optionalGstinSchema = z.union([
  z.literal(""),
  z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[0-9A-Z]{15}$/, "GSTIN must be 15 letters/digits")),
]);
