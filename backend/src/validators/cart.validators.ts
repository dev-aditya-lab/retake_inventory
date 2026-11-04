import { z } from "zod";
import { MAX_PRICE_OVERRIDE } from "../utils/cartPricing";

const customerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  company: z.string().trim().optional(),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  gstin: z.string().trim().optional(),
  // Place of supply (GST state code). Blank = from the GSTIN, or the shop's own state.
  stateCode: z.string().trim().max(2).optional(),
});

const gstSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["CGST_SGST", "IGST"]).optional(),
  percentage: z.number().min(0).max(100),
});

export const updateCartSchema = z.object({
  customer: customerSchema.optional(),
  isB2b: z.boolean().optional(),
  gstApplicable: z.boolean().optional(),
  gst: gstSchema.optional(),
  otherCharges: z.number().min(0).optional(),
  paymentMethod: z.enum(["cash", "cheque", "upi", "bank_transfer"]).optional(),
  // Money handed over now; null puts it back to "paid in full".
  amountReceived: z.number().min(0).max(100_000_000).nullable().optional(),
  // The day the balance is expected by; null clears it.
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15")
    .nullable()
    .optional(),
  note: z.string().optional(),
});

export const addCartItemSchema = z
  .object({
    productId: z.string().trim().optional(),
    ean13: z.string().regex(/^\d{13}$/).optional(),
    quantity: z.number().int().positive(),
  })
  .refine((v) => v.productId || v.ean13, { message: "Provide either productId or ean13" });

export const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(0).optional(),
    // The price typed in at the counter for this line; null goes back to the list price.
    price: z.number().positive("Enter a price greater than 0").max(MAX_PRICE_OVERRIDE, "That price is too large").nullable().optional(),
  })
  .refine((v) => v.quantity !== undefined || v.price !== undefined, { message: "Provide a quantity or a price" });
