import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";

export const USER_ROLES = ["admin", "sales", "inventory_manager"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /** The mobile number staff sign in with (codes are sent to its WhatsApp). Stored as the bare 10 digits. */
    phone: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, required: true, default: "sales" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

// Accounts made before one-time-code login still have a stored password hash in the
// database. It is no longer read or written; make sure it can never leak into a response.
userSchema.set("toJSON", {
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    return ret;
  },
});

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model("User", userSchema);
