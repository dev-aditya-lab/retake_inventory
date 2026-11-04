import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

export const SAVED_KINDS = ["text", "buttons", "list", "cta", "location", "contact", "media"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

/**
 * A reusable message in the shared library ("Saved messages"). Plain text is
 * the old "quick reply"; the other kinds hold everything needed to send a
 * button message, list, link button, location, contact card or a file kept in
 * Cloudinary. `data` is validated per kind when it is saved (see the validators).
 */
const savedSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 40 },
    kind: { type: String, enum: SAVED_KINDS, default: "text" },
    /** The words, for kind "text". Other kinds keep theirs inside `data`. */
    text: { type: String, default: "", trim: true, maxlength: 4096 },
    data: { type: Schema.Types.Mixed },
    /** Lets staff order them; lower first. */
    position: { type: Number, default: 0 },
    createdBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

savedSchema.index({ position: 1, title: 1 });

export type WhatsappQuickReplyDoc = HydratedDocument<InferSchemaType<typeof savedSchema>>;

export const WhatsappQuickReply = model("WhatsappQuickReply", savedSchema);
