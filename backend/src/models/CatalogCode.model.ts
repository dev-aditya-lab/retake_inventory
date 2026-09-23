import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { MAX_PRODUCT_ID } from "../config/barcodeScheme";

/**
 * One row of Retake's product code list — maps a spice name to the two codes
 * its products are built from:
 *   skuCode   -> SKU product segment    (RTK-TUR-WH-025)
 *   productId -> EAN-13 PPP segment     (890 11 001 01 01)
 * Managed by admins from the "SKU codes" page.
 */
const catalogCodeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    skuCode: { type: String, required: true, uppercase: true, trim: true },
    productId: { type: Number, required: true, min: 1, max: MAX_PRODUCT_ID },
    category: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

// Case-insensitive so "turmeric" can't sit alongside "Turmeric".
catalogCodeSchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
catalogCodeSchema.index({ skuCode: 1 }, { unique: true });
catalogCodeSchema.index({ productId: 1 }, { unique: true });

export type CatalogCodeDoc = HydratedDocument<InferSchemaType<typeof catalogCodeSchema>>;

export const CatalogCode = model("CatalogCode", catalogCodeSchema);
