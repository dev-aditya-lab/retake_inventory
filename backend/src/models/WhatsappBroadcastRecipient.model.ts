import { Schema, model, Types } from "mongoose";

export const RECIPIENT_STATUSES = ["queued", "sent", "delivered", "read", "failed"] as const;

/** One person in a broadcast and how far their message got. */
const recipientSchema = new Schema({
  broadcast: { type: Types.ObjectId, ref: "WhatsappBroadcast", required: true },
  waId: { type: String, required: true },
  name: { type: String, default: "" },
  status: { type: String, enum: RECIPIENT_STATUSES, default: "queued" },
  /** WhatsApp's id for the message, so delivery receipts find their way back here. */
  waMessageId: { type: String },
  error: { type: String },
  sentAt: { type: Date },
});

recipientSchema.index({ broadcast: 1, status: 1, _id: 1 });
recipientSchema.index({ waMessageId: 1 }, { sparse: true });

export const WhatsappBroadcastRecipient = model("WhatsappBroadcastRecipient", recipientSchema);
