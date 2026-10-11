import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_RETENTION_SECONDS = 180 * 24 * 60 * 60;

/**
 * Something about the WhatsApp account an admin should know: a template that
 * was rejected or paused, the number's quality dropping, an account warning.
 */
const alertSchema = new Schema({
  /** The webhook field it came from, e.g. "message_template_status_update". */
  kind: { type: String, required: true },
  severity: { type: String, enum: ALERT_SEVERITIES, required: true },
  title: { type: String, required: true },
  detail: { type: String, default: "" },
  data: { type: Schema.Types.Mixed },
  acknowledgedAt: { type: Date },
  acknowledgedBy: { type: Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});

alertSchema.index({ acknowledgedAt: 1, createdAt: -1 });
alertSchema.index({ kind: 1, createdAt: -1 });
alertSchema.index({ createdAt: 1 }, { expireAfterSeconds: ALERT_RETENTION_SECONDS });

export type WhatsappAlertDoc = HydratedDocument<InferSchemaType<typeof alertSchema>>;

export const WhatsappAlert = model("WhatsappAlert", alertSchema);
