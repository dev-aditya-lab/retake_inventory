import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

export const MESSAGE_DIRECTIONS = ["in", "out"] as const;
export const MESSAGE_STATUSES = ["received", "sent", "delivered", "read", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];
/**
 * Who produced an outgoing message:
 *  customer      - an incoming message
 *  app           - a staff member, from the in-app chat
 *  bot           - the automatic menu / answers
 *  business_app  - typed in the WhatsApp Business app (only when coexistence is on)
 *  note          - an internal note staff leave in the thread; never sent to the customer
 */
export const MESSAGE_SOURCES = ["customer", "app", "bot", "business_app", "note"] as const;

/** Messages are personal data: keep a year, then let MongoDB expire them. */
export const MESSAGE_RETENTION_SECONDS = 365 * 24 * 60 * 60;

/**
 * A photo / video / voice note / document / sticker. The file itself stays at
 * Meta, which keeps it for about 30 days and only hands out short-lived links
 * (see whatsappMedia.service). "Saving" copies it to Cloudinary so it lasts.
 */
const mediaSchema = new Schema(
  {
    kind: { type: String, enum: ["image", "video", "audio", "document", "sticker"], required: true },
    /** Meta's media id. */
    id: { type: String },
    mimeType: { type: String },
    filename: { type: String },
    sha256: { type: String },
    caption: { type: String },
    voice: { type: Boolean },
    /** Set once a copy is in Cloudinary. */
    savedPublicId: { type: String },
    savedResourceType: { type: String },
    savedAt: { type: Date },
    savedBytes: { type: Number },
  },
  { _id: false },
);

const locationSchema = new Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    name: { type: String },
    address: { type: String },
  },
  { _id: false },
);

const messageSchema = new Schema({
  conversation: { type: Types.ObjectId, ref: "WhatsappConversation", required: true },
  /** WhatsApp's id (wamid...). Unique, so a redelivered webhook can't store a message twice. */
  waMessageId: { type: String },
  direction: { type: String, enum: MESSAGE_DIRECTIONS, required: true },
  type: { type: String, default: "text" },
  /** The text, or a short placeholder such as "[Photo]" for things the app can't show yet. */
  text: { type: String, default: "" },
  status: { type: String, enum: MESSAGE_STATUSES, default: "received" },
  error: { type: String },
  source: { type: String, enum: MESSAGE_SOURCES, default: "customer" },
  sentBy: { type: Types.ObjectId, ref: "User" },
  media: { type: mediaSchema },
  location: { type: locationSchema },
  /** WhatsApp id of the message this one replies to (shown as a quote). */
  replyToWaId: { type: String },
  /** Emoji reactions on this message: the customer's and the team's. */
  customerReaction: { type: String },
  staffReaction: { type: String },
  timestamp: { type: Date, required: true, default: Date.now },
});

messageSchema.index({ waMessageId: 1 }, { unique: true, sparse: true });
messageSchema.index({ conversation: 1, timestamp: -1 });
messageSchema.index({ timestamp: 1 }, { expireAfterSeconds: MESSAGE_RETENTION_SECONDS });

export type WhatsappMessageDoc = HydratedDocument<InferSchemaType<typeof messageSchema>>;

export const WhatsappMessage = model("WhatsappMessage", messageSchema);
