import { z } from "zod";
import { dateRangeQuerySchema } from "./report.validators";
import { objectIdSchema, optionalEmailSchema, paginationQuerySchema } from "./common.validators";

export const listNonGstBillsQuerySchema = paginationQuerySchema.extend(dateRangeQuerySchema.shape).extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["paid", "void"]).optional(),
});

export const updateNonGstBillSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1, "Customer name is required").max(100),
    company: z.string().trim().max(120).optional(),
    address: z.string().trim().max(300).optional(),
    phone: z.string().trim().max(20).optional(),
    email: optionalEmailSchema.optional(),
  }),
  // Which price list the line prices are from. Left out, the bill keeps its own.
  priceList: z.enum(["b2b", "retail"]).optional(),
  items: z
    .array(
      z.object({
        product: objectIdSchema,
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1, "A bill needs at least one item")
    .max(200),
  otherCharges: z.number().min(0),
  paymentMethod: z.enum(["cash", "cheque", "upi", "bank_transfer"]),
  note: z.string().trim().max(500).optional(),
});

export const cancelNonGstBillSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const sendNonGstWhatsappSchema = z.object({
  // Send to a different number than the one on the bill.
  phone: z.string().trim().max(20).optional(),
});
