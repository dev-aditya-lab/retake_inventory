import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * The current state of each message template. Kept up to date two ways: Meta's
 * template webhooks (status / quality changes) and an on-demand sync that pulls
 * the full list, including each template's text, so staff can pick one to send.
 */
const buttonSchema = new Schema(
  {
    type: { type: String, required: true },
    text: { type: String, default: "" },
    url: { type: String },
    phone: { type: String },
  },
  { _id: false },
);

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

    // ----- Content (filled by a sync from Meta; absent for webhook-only rows) -----
    parameterFormat: { type: String, enum: ["POSITIONAL", "NAMED"], default: "POSITIONAL" },
    headerFormat: { type: String, default: "" },
    headerText: { type: String, default: "" },
    bodyText: { type: String, default: "" },
    footerText: { type: String, default: "" },
    headerVariables: { type: [String], default: [] },
    bodyVariables: { type: [String], default: [] },
    buttons: { type: [buttonSchema], default: [] },
    syncedAt: { type: Date },
  },
  { timestamps: true },
);

templateSchema.index({ name: 1, language: 1 }, { unique: true });

export type WhatsappTemplateDoc = HydratedDocument<InferSchemaType<typeof templateSchema>>;

export const WhatsappTemplate = model("WhatsappTemplate", templateSchema);
