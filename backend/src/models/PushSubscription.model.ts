import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/** A device that has agreed to receive notifications (one per browser / installed app). */
const pushSubscriptionSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    /** The push service's URL for this device. Unique: one device, one row. */
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
    lastSuccessAt: { type: Date },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

export type PushSubscriptionDoc = HydratedDocument<InferSchemaType<typeof pushSubscriptionSchema>>;

export const PushSubscription = model("PushSubscription", pushSubscriptionSchema);
