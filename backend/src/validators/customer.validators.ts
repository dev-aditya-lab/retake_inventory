import { z } from "zod";
import { optionalEmailSchema, optionalGstinSchema, paginationQuerySchema } from "./common.validators";

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
});

export const customerLookupQuerySchema = z.object({
  phone: z.string().trim().min(1).max(20),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100).optional(),
  company: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().min(1).max(20).optional(),
  email: optionalEmailSchema.optional(),
  gstin: optionalGstinSchema.optional(),
  // Also rewrite the customer details printed on their past invoices.
  applyToInvoices: z.boolean().optional(),
});
