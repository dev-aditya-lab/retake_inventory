import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * HSN/SAC code list, managed by admins from the "HSN codes" page. Products
 * store the code itself (Product.hsnCode) and invoices snapshot it per line,
 * so this list is the picklist and reference, not a hard foreign key.
 */
const hsnCodeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: "", trim: true },
    // Optional reference rate (%). Not applied automatically at billing.
    gstRate: { type: Number, min: 0, max: 100 },
  },
  { timestamps: true },
);

export type HsnCodeDoc = HydratedDocument<InferSchemaType<typeof hsnCodeSchema>>;

export const HsnCode = model("HsnCode", hsnCodeSchema);
