import { Schema, model, Types } from "mongoose";

/** One row of WhatsApp-wide switches (key "main"). Absent row = everything on. */
const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    /** Master switch: off = no automatic replies, no outgoing messages, incoming webhooks ignored. */
    enabled: { type: Boolean, default: true },
    updatedBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const WhatsappSettings = model("WhatsappSettings", settingsSchema);
