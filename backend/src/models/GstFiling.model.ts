import { Schema, model, Types } from "mongoose";

/**
 * A month whose GSTR-1 has been filed on the GST portal. Its invoices are
 * locked from then on: corrections become credit notes in a later month
 * (editing a filed invoice in place would make the books disagree with the
 * return, and GSTR-3B's sales figures are locked to GSTR-1 since July 2025).
 */
const gstFilingSchema = new Schema(
  {
    period: { type: String, required: true, unique: true }, // "YYYY-MM"
    filedAt: { type: Date, required: true, default: Date.now },
    filedBy: { type: Types.ObjectId, ref: "User", required: true },
    /** Acknowledgement Reference Number from the portal, if the admin records it. */
    arn: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

export const GstFiling = model("GstFiling", gstFilingSchema);
