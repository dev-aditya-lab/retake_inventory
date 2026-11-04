import { z } from "zod";
import { MAX_CUSTOMER_TAGS, MAX_TAG_LENGTH } from "../utils/customerTags";
import { optionalEmailSchema, optionalGstinSchema, paginationQuerySchema } from "./common.validators";

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
});

export const customerLookupQuerySchema = z.object({
  phone: z.string().trim().min(1).max(20),
});

const notesSchema = z.string().trim().max(500, "Notes can be at most 500 characters");
const tagsSchema = z.array(z.string().max(MAX_TAG_LENGTH, `Labels can be at most ${MAX_TAG_LENGTH} characters`)).max(MAX_CUSTOMER_TAGS);

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: z.string().trim().min(1, "Phone is required").max(20),
  company: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  email: optionalEmailSchema.optional(),
  gstin: optionalGstinSchema.optional(),
  notes: notesSchema.optional(),
  tags: tagsSchema.optional(),
  /** Where the contact was saved from. */
  source: z.enum(["manual", "whatsapp"]).default("manual"),
});

export const updateCustomerSchema = z.object({
  notes: notesSchema.optional(),
  tags: tagsSchema.optional(),
  name: z.string().trim().min(1, "Name is required").max(100).optional(),
  company: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().min(1).max(20).optional(),
  email: optionalEmailSchema.optional(),
  gstin: optionalGstinSchema.optional(),
  // Also rewrite the customer details printed on their past invoices.
  applyToInvoices: z.boolean().optional(),
});
