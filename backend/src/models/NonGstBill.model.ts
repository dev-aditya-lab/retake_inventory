import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";
import { PAYMENT_METHODS, paymentFields } from "./paymentSchemas";

// A bill with no GST on it. Deliberately its own collection, number series and
// code path: it must never reach GSTR-1 / GSTR-3B, credit notes, the GST filing
// lock or the GST sales reports, all of which read the Invoice collection only.

// paid — a normal sale.
// void — cancelled: stock returned, kept on record so the number series has no gaps.
export const NON_GST_BILL_STATUSES = ["paid", "void"] as const;
export type NonGstBillStatus = (typeof NON_GST_BILL_STATUSES)[number];

/** Which price list the bill was made at: the B2B price or the retail MRP. No tax is added either way. */
export const PRICE_LISTS = ["b2b", "retail"] as const;
export type PriceList = (typeof PRICE_LISTS)[number];

const nonGstLineSchema = new Schema(
  {
    product: { type: Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const nonGstBillSchema = new Schema(
  {
    billNumber: { type: String, required: true, unique: true, index: true }, // NG-YYMMDD-NNNN
    billingDate: { type: Date, required: true, default: Date.now },

    customer: {
      name: { type: String, required: true, trim: true },
      company: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
    },

    priceList: { type: String, enum: PRICE_LISTS, required: true },
    items: { type: [nonGstLineSchema], required: true, validate: (v: unknown[]) => v.length > 0 },

    otherCharges: { type: Number, default: 0, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountInWords: { type: String, required: true },

    // The method of the first payment (kept for exports and old readers); see paymentSchemas.ts.
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    ...paymentFields,
    status: { type: String, enum: NON_GST_BILL_STATUSES, default: "paid" },
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

nonGstBillSchema.index({ billingDate: -1 });
nonGstBillSchema.index({ status: 1, billingDate: -1 });

export type NonGstBillDoc = HydratedDocument<InferSchemaType<typeof nonGstBillSchema>>;

export const NonGstBill = model("NonGstBill", nonGstBillSchema);
