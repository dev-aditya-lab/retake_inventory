import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

const productSchema = new Schema(
  {
    category: { type: String, required: true, trim: true }, // e.g. "Single Spice", "Blend"
    name: { type: String, required: true, trim: true }, // e.g. "Turmeric"
    productId: { type: Number, required: true }, // barcode PPP code, e.g. 1
    type: { type: String, enum: ["Whole", "Powder", "Blend"], required: true },
    weightLabel: { type: String, required: true }, // e.g. "25g"
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    ean12: { type: String, required: true },
    ean13: { type: String, required: true, unique: true, index: true },
    hsnCode: { type: String, default: "" },
    image: { type: String, default: "https://placehold.co/400x400.png?text=Retake" },
    costPrice: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
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
