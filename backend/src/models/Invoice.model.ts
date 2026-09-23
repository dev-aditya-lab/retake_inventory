import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

export const INVOICE_STATUSES = ["paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const invoiceItemSchema = new Schema(
  {
    product: { type: Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    hsnCode: { type: String, default: "" },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true }, // RTK-INV-YYMMDD-XXXX
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

    items: { type: [invoiceItemSchema], required: true, validate: (v: unknown[]) => v.length > 0 },

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

    paymentMethod: { type: String, enum: ["cash", "cheque", "upi", "bank_transfer"], required: true },
    // "void" = cancelled by an admin: stock returned, excluded from reports.
    // Invoices are never hard-deleted — the number sequence and audit trail stay intact.
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
