import { z } from "zod";

export const createProductSchema = z.object({
  category: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(["Whole", "Powder", "Blend"]),
  weightLabel: z.string().trim().min(1),
  variant: z.string().regex(/^\d{2}$/).optional(),
  // A pre-existing (e.g. third-party) barcode scanned in as-is. When set, Retake's
  // EAN-13 generation is skipped entirely and this becomes the product's barcode.
  barcode: z.string().regex(/^\d{13}$/, "Must be a 13-digit EAN-13 code").optional(),
  // Required for external products; auto-generated from the SKU scheme for Retake's own products if omitted.
  sku: z.string().trim().min(1).optional(),
  hsnCode: z.string().trim().optional(),
  image: z.string().url().optional(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  quantityInStock: z.number().min(0).optional(),
  lowStockThreshold: z.number().min(0).optional(),
  note: z.string().optional(),
});

export const updateProductSchema = z.object({
  // Identity fields — admin-only (enforced in the controller). Changing a
  // Retake product's name/type/weight regenerates its barcode.
  name: z.string().trim().min(1).optional(),
  type: z.enum(["Whole", "Powder", "Blend"]).optional(),
  weightLabel: z.string().trim().min(1).optional(),
  sku: z.string().trim().min(1).max(40).optional(),
  barcode: z.string().regex(/^\d{13}$/, "Must be a 13-digit EAN-13 code").optional(),
  category: z.string().trim().min(1).optional(),
  hsnCode: z.string().trim().optional(),
  image: z.string().url().optional(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  lowStockThreshold: z.number().min(0).optional(),
  note: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const listProductsQuerySchema = z.object({
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  type: z.enum(["Whole", "Powder", "Blend"]).optional(),
  lowStockOnly: z.enum(["true", "false"]).optional(),
  status: z.enum(["active", "inactive", "all"]).optional(),
});

export const adjustStockSchema = z.object({
  quantityChange: z.number().int().refine((n) => n !== 0, "quantityChange cannot be 0"),
  type: z.enum(["restock", "adjustment", "correction"]),
  note: z.string().optional(),
});
