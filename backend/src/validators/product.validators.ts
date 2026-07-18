import { z } from "zod";

export const createProductSchema = z.object({
  category: z.string().trim().min(1),
  name: z.string().trim().min(1),
  type: z.enum(["Whole", "Powder", "Blend"]),
  weightLabel: z.string().trim().min(1),
  variant: z.string().regex(/^\d{2}$/).optional(),
  sku: z.string().trim().min(1), // no reliable auto-abbreviation from product name — admin supplies it
  hsnCode: z.string().trim().optional(),
  image: z.string().url().optional(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  quantityInStock: z.number().min(0).optional(),
  lowStockThreshold: z.number().min(0).optional(),
  note: z.string().optional(),
});

export const updateProductSchema = z.object({
  category: z.string().trim().min(1).optional(),
  hsnCode: z.string().trim().optional(),
  image: z.string().url().optional(),
  costPrice: z.number().min(0).optional(),
  sellingPrice: z.number().min(0).optional(),
  lowStockThreshold: z.number().min(0).optional(),
  note: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const adjustStockSchema = z.object({
  quantityChange: z.number().int().refine((n) => n !== 0, "quantityChange cannot be 0"),
  type: z.enum(["restock", "adjustment", "correction"]),
  note: z.string().optional(),
});
