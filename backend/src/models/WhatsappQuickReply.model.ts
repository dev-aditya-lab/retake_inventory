import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/** A saved reply staff can drop into the chat box (opening hours, payment details, "we'll check and tell you"...). */
const quickReplySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 40 },
    text: { type: String, required: true, trim: true, maxlength: 4096 },
    /** Lets staff order them; lower first. */
    position: { type: Number, default: 0 },
    createdBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

quickReplySchema.index({ position: 1, title: 1 });

export type WhatsappQuickReplyDoc = HydratedDocument<InferSchemaType<typeof quickReplySchema>>;

export const WhatsappQuickReply = model("WhatsappQuickReply", quickReplySchema);
