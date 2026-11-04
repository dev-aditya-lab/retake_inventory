import { Types } from "mongoose";
import { getCloudinary, isCloudinaryConfigured } from "../config/cloudinary";
import { logger } from "../config/logger";
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

export const MAX_DELETE_BATCH = 200;

export interface DeleteResult {
  chats: number;
  messages: number;
  /** Saved Cloudinary copies that were removed. */
  files: number;
}

/**
 * Deletes chats from the app (the chat and every message in it). This does not
 * touch WhatsApp itself: the customer keeps their copy, and if they write again
 * a fresh chat starts. With `deleteSavedFiles`, the Cloudinary copies of the
 * photos and files in those chats are removed too.
 */
export async function deleteChats(ids: string[], deleteSavedFiles: boolean): Promise<DeleteResult> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) throw ApiError.badRequest("Choose at least one chat");
  if (unique.length > MAX_DELETE_BATCH) throw ApiError.badRequest(`Delete at most ${MAX_DELETE_BATCH} chats at a time`);

  let files = 0;
  if (deleteSavedFiles && isCloudinaryConfigured()) {
    const saved = await WhatsappMessage.find({ conversation: { $in: unique }, "media.savedPublicId": { $exists: true } })
      .select("media.savedPublicId media.savedResourceType")
      .lean();
    const cloudinary = getCloudinary();
    for (const m of saved) {
      const publicId = m.media?.savedPublicId;
      if (!publicId) continue;
      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: (m.media?.savedResourceType as "image" | "video" | "raw" | undefined) ?? "raw",
          type: "authenticated",
          invalidate: true,
        });
        files += 1;
      } catch (err) {
        // A file that can't be removed must not block deleting the chat; it is logged for follow-up.
        logger.warn({ err, publicId }, "Could not delete a saved WhatsApp file from Cloudinary");
      }
    }
  }

  const messages = await WhatsappMessage.deleteMany({ conversation: { $in: unique } });
  const chats = await WhatsappConversation.deleteMany({ _id: { $in: unique } });
  return { chats: chats.deletedCount ?? 0, messages: messages.deletedCount ?? 0, files };
}
