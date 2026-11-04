import { Schema, model, Types } from "mongoose";

/**
 * One row of WhatsApp-wide settings (key "main"). Absent row = everything on,
 * and credentials come from the server's environment instead.
 *
 * Credentials entered in the app live here; each field that is set overrides
 * its environment counterpart. Secrets are stored encrypted (see utils/secretBox).
 */
const settingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    /** Master switch: off = no automatic replies, no outgoing messages, incoming webhooks ignored. */
    enabled: { type: Boolean, default: true },
    /** Copy every photo / file a customer sends to Cloudinary as it arrives (Meta only keeps them ~30 days). */
    autoSaveMedia: { type: Boolean, default: false },

    // ----- Credentials (all optional: unset falls back to the environment) -----
    phoneNumberId: { type: String, trim: true },
    businessAccountId: { type: String, trim: true },
    appId: { type: String, trim: true },
    /** Graph API version, e.g. "v22.0". */
    apiVersion: { type: String, trim: true },
    /** Encrypted secrets (v1:iv:tag:data). Never returned to the browser. */
    accessTokenEnc: { type: String },
    verifyTokenEnc: { type: String },
    appSecretEnc: { type: String },

    /** Filled in by "Test connection": the number as Meta knows it. */
    displayPhoneNumber: { type: String },
    verifiedName: { type: String },
    lastCheckedAt: { type: Date },

    updatedBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const WhatsappSettings = model("WhatsappSettings", settingsSchema);
