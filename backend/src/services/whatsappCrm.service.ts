import { Types } from "mongoose";
import { User } from "../models/User.model";
import { WhatsappConversation } from "../models/WhatsappConversation.model";
import { WhatsappMessage } from "../models/WhatsappMessage.model";
import { ApiError } from "../utils/ApiError";
import { normalizeTags } from "../utils/customerTags";

/**
 * The CRM side of a chat: who owns it, whether it is still open, the labels on
 * it, and private notes. None of this is ever sent to the customer.
 */

export interface ConversationPatch {
  labels?: string[];
  /** A user id, or null to unassign. */
  assignedTo?: string | null;
  status?: "open" | "resolved";
}

export async function updateConversation(id: string, patch: ConversationPatch): Promise<void> {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};

  if (patch.labels !== undefined) $set.labels = normalizeTags(patch.labels);

  if (patch.assignedTo !== undefined) {
    if (patch.assignedTo === null) {
      $unset.assignedTo = "";
    } else {
      const user = await User.findOne({ _id: patch.assignedTo, isActive: true }).select("_id").lean();
      if (!user) throw ApiError.badRequest("That person can't be assigned (not found or deactivated)");
      $set.assignedTo = new Types.ObjectId(patch.assignedTo);
    }
  }

  if (patch.status !== undefined) {
    $set.status = patch.status;
    if (patch.status === "resolved") {
      $set.resolvedAt = new Date();
      // Done with it: the "needs a reply" flag no longer applies.
      $set.needsHuman = false;
    } else {
      $unset.resolvedAt = "";
    }
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) return;

  const result = await WhatsappConversation.updateOne(
    { _id: id },
    { ...(Object.keys($set).length > 0 ? { $set } : {}), ...(Object.keys($unset).length > 0 ? { $unset } : {}) },
  );
  if (result.matchedCount === 0) throw ApiError.notFound("Chat not found");
}

export const MAX_NOTE_LENGTH = 2000;

/** A private note in the thread. Shown to staff only; it never reaches WhatsApp. */
export async function addNote(userId: string, id: string, rawText: string): Promise<void> {
  const text = rawText.trim();
  if (!text) throw ApiError.badRequest("Write the note first");
  if (text.length > MAX_NOTE_LENGTH) throw ApiError.badRequest(`Notes can be at most ${MAX_NOTE_LENGTH} characters`);
  if (!(await WhatsappConversation.exists({ _id: id }))) throw ApiError.notFound("Chat not found");

  await WhatsappMessage.create({
    conversation: id,
    direction: "out",
    type: "note",
    text,
    status: "sent",
    source: "note",
    sentBy: userId,
    timestamp: new Date(),
  });
}

/** Everyone a chat can be assigned to. */
export async function listAgents() {
  const users = await User.find({ isActive: true }).select("name role").sort({ name: 1 }).lean();
  return users.map((u) => ({ id: String(u._id), name: u.name, role: u.role }));
}

/** Every label in use, for the filter and the suggestions. */
export async function listLabels(): Promise<string[]> {
  const labels = (await WhatsappConversation.distinct("labels")) as string[];
  return labels.filter(Boolean).sort((a, b) => a.localeCompare(b));
}
