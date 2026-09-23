import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";
import { gstDocumentFields, gstLineSchema } from "./gstSchemas";

// paid     — a normal sale.
// void     — cancelled before its month's GSTR-1 was filed: stock returned,
//            reported only as "cancelled" in GSTR-1 Table 13.
// credited — fully reversed by a credit note after its month was filed.
// Invoices are never hard-deleted — the number sequence and audit trail stay intact.
export const INVOICE_STATUSES = ["paid", "void", "credited"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Invoices created with per-line GST (tax invoice under CGST Rule 46). */
export const GST_VERSION = 2;

const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true }, // RTK-YYMMDD-NNNN
    billingDate: { type: Date, required: true, default: Date.now },

    customer: {
      name: { type: String, required: true, trim: true },
      company: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      gstin: { type: String, default: "" },
    },
    // Link to the customer directory entry (set when the bill has a phone number).
    customerRef: { type: Types.ObjectId, ref: "Customer" },

    items: { type: [gstLineSchema], required: true, validate: (v: unknown[]) => v.length > 0 },

    // Absent on legacy invoices (single bill-level GST %, below); 2 = per-line GST.
    gstVersion: { type: Number },
    ...gstDocumentFields,

    // Legacy bill-level GST summary. Still filled for GST-v2 invoices so older
    // readers (exports, WhatsApp/email, reports) keep working.
    gst: {
      enabled: { type: Boolean, default: false },
      type: { type: String, enum: ["CGST_SGST", "IGST"] },
      percentage: { type: Number, default: 0, min: 0, max: 100 },
      amount: { type: Number, default: 0, min: 0 },
      cgstAmount: { type: Number },
      sgstAmount: { type: Number },
      igstAmount: { type: Number },
    },

    otherCharges: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountInWords: { type: String, required: true },
    // Sum of credit notes issued against this invoice (returns after filing).
    creditedTotal: { type: Number, default: 0, min: 0 },

    paymentMethod: { type: String, enum: ["cash", "cheque", "upi", "bank_transfer"], required: true },
    status: { type: String, enum: INVOICE_STATUSES, default: "paid" },
    note: { type: String, default: "" },

    createdBy: { type: Types.ObjectId, ref: "User", required: true },
    whatsappSentAt: { type: Date },
    emailSentAt: { type: Date },

    editedAt: { type: Date },
    editedBy: { type: Types.ObjectId, ref: "User" },
    cancelledAt: { type: Date },
    cancelledBy: { type: Types.ObjectId, ref: "User" },
    cancelReason: { type: String, default: "" },
  },
  { timestamps: true },
);

invoiceSchema.index({ billingDate: -1 });
invoiceSchema.index({ status: 1, billingDate: -1 });
invoiceSchema.index({ customerRef: 1, billingDate: -1 });

export type InvoiceDoc = HydratedDocument<InferSchemaType<typeof invoiceSchema>>;

export const Invoice = model("Invoice", invoiceSchema);
