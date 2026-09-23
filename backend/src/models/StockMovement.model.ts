import { Schema, model, Types } from "mongoose";

const stockMovementSchema = new Schema(
  {
    product: { type: Types.ObjectId, ref: "Product", required: true, index: true },
    // sale_edit: an admin changed quantities on an existing invoice.
    // sale_cancel: an admin cancelled an invoice and its stock was returned.
    type: {
      type: String,
      enum: ["restock", "sale", "adjustment", "correction", "sale_edit", "sale_cancel"],
      required: true,
    },
    quantityChange: { type: Number, required: true }, // positive = added, negative = removed
    resultingQuantity: { type: Number, required: true },
    invoice: { type: Types.ObjectId, ref: "Invoice" },
    user: { type: Types.ObjectId, ref: "User", required: true },
    note: { type: String, default: "" },
  },
  { timestamps: true },
);

export const StockMovement = model("StockMovement", stockMovementSchema);
