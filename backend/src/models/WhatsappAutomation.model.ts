import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

export const AUTOMATION_TYPES = ["keyword", "welcome", "away"] as const;
export type AutomationType = (typeof AUTOMATION_TYPES)[number];

/**
 * An automatic reply:
 *  keyword - a customer's message contains one of the keywords
 *  welcome - a customer's very first message to the shop
 *  away    - a message that arrives outside business hours (once every 12 hours per customer)
 * The reply is either plain text or a message from the saved library (any kind).
 */
const automationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, enum: AUTOMATION_TYPES, required: true },
    enabled: { type: Boolean, default: true },
    keywords: { type: [String], default: [] },
    match: { type: String, enum: ["contains", "exact"], default: "contains" },
    reply: {
      kind: { type: String, enum: ["text", "saved"], default: "text" },
      text: { type: String, default: "", maxlength: 4096 },
      savedId: { type: Types.ObjectId, ref: "WhatsappQuickReply" },
    },
    /** How many times it has fired. */
    timesUsed: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
    createdBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

automationSchema.index({ type: 1, enabled: 1 });

export type WhatsappAutomationDoc = HydratedDocument<InferSchemaType<typeof automationSchema>>;

export const WhatsappAutomation = model("WhatsappAutomation", automationSchema);
