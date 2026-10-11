import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

/** Raw webhook events are for debugging and replay only, so they expire quickly. */
export const EVENT_RETENTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * A log of every non-message webhook event (templates, account, quality, ...)
 * exactly as Meta sent it. Whatever we don't act on is still here, so enabling
 * a new webhook field never silently loses information.
 */
const eventSchema = new Schema({
  field: { type: String, required: true },
  entryId: { type: String },
  value: { type: Schema.Types.Mixed },
  outcome: { type: String, enum: ["processed", "ignored", "failed"], required: true },
  error: { type: String },
  receivedAt: { type: Date, default: Date.now },
});

eventSchema.index({ field: 1, receivedAt: -1 });
eventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: EVENT_RETENTION_SECONDS });

export type WhatsappEventDoc = HydratedDocument<InferSchemaType<typeof eventSchema>>;

export const WhatsappEvent = model("WhatsappEvent", eventSchema);
