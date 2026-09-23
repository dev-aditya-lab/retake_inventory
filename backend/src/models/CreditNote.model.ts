import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";
import { gstDocumentFields, gstLineSchema } from "./gstSchemas";

/**
 * A credit note (CGST s.34, Rule 53) reversing all or part of an invoice
 * whose month's GSTR-1 was already filed — the only lawful way to correct a
 * filed sale. Reported in GSTR-1 of the month it's issued: CDNR for
 * registered buyers, CDNUR for large inter-state retail (B2CL) bills, and
 * netted into B2CS for other retail bills.
 */
const creditNoteSchema = new Schema(
  {
    noteNumber: { type: String, required: true, unique: true }, // CN-YYMMDD-NNNN
    noteDate: { type: Date, required: true, default: Date.now },

    invoice: { type: Types.ObjectId, ref: "Invoice", required: true, index: true },
    invoiceNumber: { type: String, required: true },
    invoiceDate: { type: Date, required: true },
    /** GSTR-1 category of the original invoice: decides CDNR / CDNUR / B2CS. */
    invoiceCategory: { type: String, enum: ["B2B", "B2CL", "B2CS"], required: true },

    customer: {
      name: { type: String, required: true },
      company: { type: String, default: "" },
      address: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      gstin: { type: String, default: "" },
    },

    items: { type: [gstLineSchema], required: true, validate: (v: unknown[]) => v.length > 0 },
    ...gstDocumentFields,
    grandTotal: { type: Number, required: true, min: 0 },
    amountInWords: { type: String, required: true },

    reason: { type: String, default: "" },
    /** True when it reverses the whole invoice (the bill was "deleted" after filing). */
    isFullReversal: { type: Boolean, default: false },
    createdBy: { type: Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

creditNoteSchema.index({ noteDate: -1 });

export type CreditNoteDoc = HydratedDocument<InferSchemaType<typeof creditNoteSchema>>;

export const CreditNote = model("CreditNote", creditNoteSchema);
