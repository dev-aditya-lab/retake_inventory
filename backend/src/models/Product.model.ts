import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const productSchema = new Schema(
  {
    category: { type: String, required: true, trim: true }, // e.g. "Single Spice", "Blend"
    name: { type: String, required: true, trim: true }, // e.g. "Turmeric"
    productId: { type: Number }, // barcode PPP code, e.g. 1 — only set for Retake-generated barcodes
    type: { type: String, enum: ["Whole", "Powder", "Blend"], required: true },
    weightLabel: { type: String, required: true }, // e.g. "25g"
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    ean12: { type: String }, // only set for Retake-generated barcodes
    ean13: { type: String, required: true, unique: true, index: true },
    // "generated": Retake's own EAN-13 scheme (name/type/weight -> code).
    // "external": a pre-existing barcode (e.g. a third-party product) scanned
    // in as-is — not derived from Retake's scheme, so it isn't decodable.
    barcodeSource: { type: String, enum: ["generated", "external"], required: true, default: "generated" },
    hsnCode: { type: String, default: "" },
    image: { type: String, default: "https://placehold.co/400x400.png?text=Retake" },
    costPrice: { type: Number, default: 0, min: 0 },
    // B2B price, EXCLUDING GST — GST is added on top for buyers with a GSTIN.
    sellingPrice: { type: Number, default: 0, min: 0 },
    // Retail MRP, INCLUDING GST (as the law requires of an MRP) — charged to
    // buyers without a GSTIN; the GST inside it is worked out on the bill.
    mrp: { type: Number, min: 0 },
    // GST rate in % (spices and masalas: 5). Must be a rate the portal accepts.
    gstRate: { type: Number, min: 0, max: 100 },
    // Unit Quantity Code for GST returns, e.g. PAC (packs).
    uqc: { type: String, default: "PAC", uppercase: true, trim: true },
    quantityInStock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 10, min: 0 },
    note: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

productSchema.index({ name: 1, type: 1, weightLabel: 1 }, { unique: true });

export type ProductDoc = HydratedDocument<InferSchemaType<typeof productSchema>>;

export const Product = model("Product", productSchema);
