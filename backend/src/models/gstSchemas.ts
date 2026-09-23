import { Schema, Types } from "mongoose";

// GST building blocks shared by invoices and credit notes, so both documents
// carry exactly the same tax detail and GSTR-1 can read them the same way.

/** The supplier's details as printed on the document — frozen at issue time. */
export const supplierSchema = new Schema(
  {
    legalName: { type: String, required: true },
    address: { type: String, default: "" },
    gstin: { type: String, required: true },
    stateCode: { type: String, required: true },
    stateName: { type: String, required: true },
  },
  { _id: false },
);

/** State code + name, e.g. { code: "20", name: "Jharkhand" }. */
export const placeOfSupplySchema = new Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

/**
 * One bill line. Legacy (pre-GST-v2) invoices only have product…total, where
 * `total` = quantity × unitPrice before tax; GST-v2 lines add the tax fields
 * and `total` includes tax.
 */
export const gstLineSchema = new Schema(
  {
    product: { type: Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    hsnCode: { type: String, default: "" },
    uqc: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    /** Exclusive of GST for B2B bills, the MRP (inclusive) for retail bills. */
    unitPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number },
    taxableValue: { type: Number },
    cgst: { type: Number },
    sgst: { type: Number },
    igst: { type: Number },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

export const otherChargesLineSchema = new Schema(
  {
    description: { type: String, default: "Other charges" },
    amount: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true },
    hsnCode: { type: String, default: "" },
    uqc: { type: String, default: "" },
    taxableValue: { type: Number, required: true },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  { _id: false },
);

export const rateSummarySchema = new Schema(
  {
    gstRate: { type: Number, required: true },
    taxableValue: { type: Number, required: true },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
  },
  { _id: false },
);

export const BUYER_TYPES = ["B2B", "B2C"] as const;
export type BuyerType = (typeof BUYER_TYPES)[number];

export const PRICE_MODES = ["exclusive", "inclusive"] as const;
export const SUPPLY_TYPES = ["intra", "inter"] as const;

/** The GST fields a GST-v2 document carries on top of its lines. */
export const gstDocumentFields = {
  supplier: { type: supplierSchema },
  buyerType: { type: String, enum: BUYER_TYPES },
  priceMode: { type: String, enum: PRICE_MODES },
  placeOfSupply: { type: placeOfSupplySchema },
  supplyType: { type: String, enum: SUPPLY_TYPES },
  otherChargesLine: { type: otherChargesLineSchema },
  rateSummary: { type: [rateSummarySchema], default: undefined },
  taxableValue: { type: Number },
  cgst: { type: Number },
  sgst: { type: Number },
  igst: { type: Number },
  totalTax: { type: Number },
  reverseCharge: { type: Boolean, default: false },
};
