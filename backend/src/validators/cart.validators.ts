import { z } from "zod";

const customerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  company: z.string().trim().optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
});

const gstSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["CGST_SGST", "IGST"]).optional(),
  percentage: z.number().min(0).max(100),
});

export const updateCartSchema = z.object({
  customer: customerSchema.optional(),
  gst: gstSchema.optional(),
  otherCharges: z.number().min(0).optional(),
  paymentMethod: z.enum(["cash", "cheque", "upi", "bank_transfer"]).optional(),
  note: z.string().optional(),
});

export const addCartItemSchema = z
  .object({
    productId: z.string().trim().optional(),
    ean13: z.string().regex(/^\d{13}$/).optional(),
    quantity: z.number().int().positive(),
  })
  .refine((v) => v.productId || v.ean13, { message: "Provide either productId or ean13" });

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0),
});
