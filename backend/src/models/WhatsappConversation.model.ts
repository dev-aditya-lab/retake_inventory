import { Schema, model, Types, type InferSchemaType, type HydratedDocument } from "mongoose";

/**
 * One chat thread per customer WhatsApp number (`waId`: digits with country
 * code). Messages live in WhatsappMessage; this keeps what the inbox list
 * needs so it never has to scan messages.
 */
const conversationSchema = new Schema(
  {
    waId: { type: String, required: true },
    /** The name the customer has on their own WhatsApp (from the webhook's contacts block). */
    profileName: { type: String, default: "" },

    lastMessageAt: { type: Date, default: Date.now },
    /** When the customer last wrote. Staff can reply with free text for 24h after this. */
    lastInboundAt: { type: Date },
    lastMessagePreview: { type: String, default: "" },
    lastDirection: { type: String, enum: ["in", "out"] },

    unreadCount: { type: Number, default: 0, min: 0 },
    /** The customer wrote something the bot can't answer, or asked for a person. Cleared when staff reply. */
    needsHuman: { type: Boolean, default: false },
    /** While in the future, the bot stays quiet for greetings and small talk (a person is handling the chat). */
    botPausedUntil: { type: Date },

    // ----- CRM -----
    /** Short labels staff put on a chat ("Wholesale", "Complaint"). */
    labels: { type: [String], default: [] },
    /** The staff member who owns this chat. Empty = anyone. */
    assignedTo: { type: Types.ObjectId, ref: "User" },
    /** Resolved chats drop out of the working list; a new customer message reopens them. */
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

conversationSchema.index({ waId: 1 }, { unique: true });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ status: 1, lastMessageAt: -1 });
conversationSchema.index({ assignedTo: 1, lastMessageAt: -1 });
conversationSchema.index({ labels: 1 });

export type WhatsappConversationDoc = HydratedDocument<InferSchemaType<typeof conversationSchema>>;

export const WhatsappConversation = model("WhatsappConversation", conversationSchema);
