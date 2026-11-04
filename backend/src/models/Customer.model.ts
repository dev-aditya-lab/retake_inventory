import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * Customer directory. Built automatically from sales: every checkout with a
 * phone number upserts the customer keyed by that number (`phoneKey`, the
 * normalized digits), so repeat buyers collapse into one record. Invoices
 * keep their own snapshot of the customer's details (a legal document
 * shouldn't change behind the scenes) and link back via Invoice.customerRef.
 */
const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    company: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    phone: { type: String, required: true, trim: true },
    phoneKey: { type: String, required: true },
    email: { type: String, default: "", trim: true },
    gstin: { type: String, default: "", trim: true, uppercase: true },
    /** Free-form note staff keep about the customer ("pays on Fridays", "wants delivery"). */
    notes: { type: String, default: "", trim: true, maxlength: 500 },
    /** Short labels such as "Wholesale" or "VIP" (see utils/customerTags). */
    tags: { type: [String], default: [] },
    /** How the entry got here: a bill, typed in by staff, or saved from a WhatsApp chat. */
    source: { type: String, enum: ["sale", "manual", "whatsapp"], default: "sale" },
    lastPurchaseAt: { type: Date },
  },
  { timestamps: true },
);

customerSchema.index({ phoneKey: 1 }, { unique: true });
customerSchema.index({ lastPurchaseAt: -1 });

export type CustomerDoc = HydratedDocument<InferSchemaType<typeof customerSchema>>;

export const Customer = model("Customer", customerSchema);
