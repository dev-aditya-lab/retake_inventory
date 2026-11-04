import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

export const BROADCAST_STATUSES = ["draft", "sending", "completed", "cancelled", "failed"] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

/**
 * One template sent to a chosen group of people, one by one. The people live in
 * WhatsappBroadcastRecipient; delivered / read counts are worked out from them.
 */
const broadcastSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    templateId: { type: Types.ObjectId, ref: "WhatsappTemplate" },
    templateName: { type: String, required: true },
    language: { type: String, required: true },
    /** The values for the template's variables, the same for everyone (see nameVariable). */
    values: { type: Schema.Types.Mixed, default: {} },
    /** 0-based position of a body variable that is filled with each person's first name. */
    nameVariable: { type: Number },
    /** What the sender chose, kept so the page can show who it went to. */
    audience: {
      allCustomers: { type: Boolean, default: false },
      customerTags: { type: [String], default: [] },
      labels: { type: [String], default: [] },
      numbers: { type: [String], default: [] },
    },
    status: { type: String, enum: BROADCAST_STATUSES, default: "draft" },
    error: { type: String },
    total: { type: Number, default: 0 },
    /** People left out because they asked to stop. */
    optedOutSkipped: { type: Number, default: 0 },
    startedAt: { type: Date },
    completedAt: { type: Date },
    createdBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

broadcastSchema.index({ createdAt: -1 });
broadcastSchema.index({ status: 1 });

export type WhatsappBroadcastDoc = HydratedDocument<InferSchemaType<typeof broadcastSchema>>;

export const WhatsappBroadcast = model("WhatsappBroadcast", broadcastSchema);
