import { Schema, model } from "mongoose";

/**
 * Marker for one-time data migrations (see src/migrations). A row is claimed
 * before its migration runs — the unique key stops two instances booting at
 * once from both running it — and removed again if the run fails, so it's
 * retried on the next boot.
 */
const migrationSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    status: { type: String, enum: ["running", "done"], required: true, default: "running" },
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

export const Migration = model("Migration", migrationSchema);
