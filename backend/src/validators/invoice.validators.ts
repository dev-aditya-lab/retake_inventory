import { z } from "zod";
import { dateRangeQuerySchema } from "./report.validators";
import { objectIdSchema, optionalEmailSchema, optionalGstinSchema, paginationQuerySchema } from "./common.validators";
import { stateCodeSchema } from "./gst.validators";

export const listInvoicesQuerySchema = paginationQuerySchema.extend(dateRangeQuerySchema.shape).extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["paid", "void", "credited"]).optional(),
  customer: objectIdSchema.optional(),
});

export const updateInvoiceSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1, "Customer name is required").max(100),
    company: z.string().trim().max(120).optional(),
    address: z.string().trim().max(300).optional(),
    phone: z.string().trim().max(20).optional(),
    email: optionalEmailSchema.optional(),
    gstin: optionalGstinSchema.optional(),
    stateCode: stateCodeSchema.optional(),
  }),
  // unitPrice: excluding GST for a buyer with a GSTIN, the MRP otherwise.
  items: z
    .array(
      z.object({
        product: objectIdSchema,
        quantity: z.number().int().min(1, "Quantity must be at least 1"),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1, "An invoice needs at least one item")
    .max(200),
  otherCharges: z.number().min(0),
  paymentMethod: z.enum(["cash", "cheque", "upi", "bank_transfer"]),
  note: z.string().trim().max(500).optional(),
});

export const cancelInvoiceSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export const creditNoteSchema = z.object({
  items: z
    .array(z.object({ product: objectIdSchema, quantity: z.number().int().min(1) }))
    .min(1, "Choose at least one item to return")
    .max(200),
  reason: z.string().trim().max(200).optional(),
});

export const sendWhatsappSchema = z.object({
  // Send to a different number than the one on the bill (e.g. the customer gave a new one).
  phone: z.string().trim().max(20).optional(),
});
