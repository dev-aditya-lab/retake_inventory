import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

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
    status: { type: String, enum: ["paid", "void"], default: "paid" },
    note: { type: String, default: "" },

    createdBy: { type: Types.ObjectId, ref: "User", required: true },
    whatsappSentAt: { type: Date },
    emailSentAt: { type: Date },
  },
  { timestamps: true },
);

invoiceSchema.index({ billingDate: -1 });

export type InvoiceDoc = HydratedDocument<InferSchemaType<typeof invoiceSchema>>;

export const Invoice = model("Invoice", invoiceSchema);
