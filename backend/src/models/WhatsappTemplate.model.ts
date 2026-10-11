import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * The current state of each message template, kept up to date from Meta's
 * template webhooks. Only templates Meta has told us about appear here.
 */
const templateSchema = new Schema(
  {
    name: { type: String, required: true },
    language: { type: String, required: true },
    templateId: { type: String },
    /** APPROVED, REJECTED, PAUSED, DISABLED, PENDING, ... as Meta reports it. */
    status: { type: String, default: "" },
    category: { type: String, default: "" },
    /** GREEN / YELLOW / RED / UNKNOWN */
    quality: { type: String, default: "" },
    reason: { type: String, default: "" },
  },
  { timestamps: true },
);

templateSchema.index({ name: 1, language: 1 }, { unique: true });

export type WhatsappTemplateDoc = HydratedDocument<InferSchemaType<typeof templateSchema>>;

export const WhatsappTemplate = model("WhatsappTemplate", templateSchema);
