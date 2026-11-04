import axios from "axios";
import type { Readable } from "stream";
import { getCloudinary, isCloudinaryConfigured } from "../config/cloudinary";
import { company } from "../config/company";
import { logger } from "../config/logger";
import { SAVED_KINDS, WhatsappQuickReply, type SavedKind } from "../models/WhatsappQuickReply.model";
import { ApiError } from "../utils/ApiError";
import { classifyMedia, type MediaKind } from "../utils/whatsappTemplates";
import { resourceTypeFor } from "../utils/whatsappMedia";
import {
  sendWhatsAppButtons,
  sendWhatsAppContacts,
  sendWhatsAppCtaUrl,
  sendWhatsAppLocation,
  sendWhatsAppMedia,
  sendWhatsAppMenu,
  sendWhatsAppText,
  uploadWhatsAppMedia,
} from "./whatsapp.service";
import { recordOutbound } from "./whatsappChat.service";
import { uploadToCloudinary } from "./whatsappMedia.service";

/**
 * The saved-message library: plain replies and every other kind of message
 * (buttons, list, link button, location, contact card, photo / file), stored
 * once and sent with a tap by staff or by an automation.
 */

export const MAX_SAVED = 100;

export type SavedData = Record<string, unknown>;

export interface SavedDto {
  id: string;
  title: string;
  kind: SavedKind;
  text: string;
  /** The kind's settings. For media: kind, filename, caption, size (never the storage id). */
  data: SavedData;
  /** One line describing it, for lists. */
  summary: string;
  position: number;
}

export interface SavedInput {
  title: string;
  kind: SavedKind;
  text?: string;
  data?: SavedData;
}

type Row = { _id: unknown; title: string; kind?: string | null; text?: string | null; data?: unknown; position?: number | null };

const asData = (value: unknown): SavedData => (value && typeof value === "object" ? (value as SavedData) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function summarize(kind: SavedKind, text: string, data: SavedData): string {
  switch (kind) {
    case "text":
      return text;
    case "buttons":
      return `${str(data.body)} [Buttons: ${((data.buttons as string[] | undefined) ?? []).join(" | ")}]`;
    case "list":
      return `${str(data.body)} [List of ${((data.rows as unknown[] | undefined) ?? []).length}]`;
    case "cta":
      return `${str(data.body)} [Link: ${str(data.buttonText)}]`;
    case "location":
      return `[Location] ${str(data.name) || `${data.latitude}, ${data.longitude}`}`;
    case "contact":
      return `[Contact card] ${str(data.name)}`;
    case "media":
      return `[${str(data.mediaKind) || "File"}] ${str(data.filename)}${data.caption ? ` - ${str(data.caption)}` : ""}`;
  }
}

function toDto(row: Row): SavedDto {
  const kind = (SAVED_KINDS as readonly string[]).includes(row.kind ?? "") ? (row.kind as SavedKind) : "text";
  const text = row.text ?? "";
  // The storage id of a file is an internal detail the browser never needs.
  const { publicId: _publicId, resourceType: _resourceType, ...data } = asData(row.data);
  return { id: String(row._id), title: row.title, kind, text, data, summary: summarize(kind, text, data), position: row.position ?? 0 };
}

export async function listQuickReplies(): Promise<SavedDto[]> {
  const rows = await WhatsappQuickReply.find().sort({ position: 1, title: 1 }).limit(MAX_SAVED).lean();
  return rows.map(toDto);
}

async function nextPosition(): Promise<number> {
  const last = await WhatsappQuickReply.findOne().sort({ position: -1 }).select("position").lean();
  return (last?.position ?? 0) + 1;
}

async function ensureRoom(): Promise<void> {
  if ((await WhatsappQuickReply.estimatedDocumentCount()) >= MAX_SAVED) {
    throw ApiError.conflict(`You can save at most ${MAX_SAVED} messages. Delete one first.`);
  }
}

export async function createQuickReply(input: SavedInput, userId: string): Promise<SavedDto> {
  await ensureRoom();
  if (input.kind === "media") throw ApiError.badRequest("Upload the file to save a photo or document");
  const row = await WhatsappQuickReply.create({
    title: input.title,
    kind: input.kind,
    text: input.kind === "text" ? (input.text ?? "") : "",
    data: input.kind === "text" ? undefined : input.data,
    position: await nextPosition(),
    createdBy: userId,
  });
  return toDto(row);
}

/** Saves a photo / video / audio / document: the file goes to Cloudinary (private) and the library keeps a reference. */
export async function createMediaSaved(
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  title: string,
  caption: string,
  userId: string,
): Promise<SavedDto> {
  if (!isCloudinaryConfigured()) {
    throw ApiError.conflict("Cloudinary isn't set up on the server, so files can't be saved. Add the three CLOUDINARY_* settings.");
  }
  await ensureRoom();
  const checked = classifyMedia(file.mimetype, file.size);
  if (!checked.ok) throw ApiError.badRequest(checked.reason);

  let uploaded;
  try {
    uploaded = await uploadToCloudinary({ source: file.buffer, kind: checked.kind, mimeType: file.mimetype, filename: file.originalname });
  } catch (err) {
    logger.error({ err }, "Cloudinary upload of a saved message failed");
    throw ApiError.badRequest("Couldn't save the file to Cloudinary. It may be too large for your plan.");
  }

  const row = await WhatsappQuickReply.create({
    title,
    kind: "media",
    data: {
      mediaKind: checked.kind,
      publicId: uploaded.publicId,
      resourceType: uploaded.resourceType,
      mimeType: file.mimetype,
      filename: file.originalname,
      caption: checked.kind === "audio" ? "" : caption.trim(),
      bytes: uploaded.bytes,
    },
    position: await nextPosition(),
    createdBy: userId,
  });
  return toDto(row);
}

export async function updateQuickReply(id: string, input: Partial<SavedInput>): Promise<SavedDto> {
  const row = await WhatsappQuickReply.findById(id);
  if (!row) throw ApiError.notFound("Saved message not found");

  if (input.title !== undefined) row.title = input.title;
  if (row.kind === "text" && input.text !== undefined) row.text = input.text;
  if (row.kind !== "text" && input.data !== undefined) {
    // A file keeps its storage id; only the caption can change.
    row.data = row.kind === "media" ? { ...asData(row.data), caption: str(input.data.caption) } : input.data;
    row.markModified("data");
  }
  await row.save();
  return toDto(row);
}

export async function deleteQuickReply(id: string): Promise<void> {
  const row = await WhatsappQuickReply.findById(id);
  if (!row) throw ApiError.notFound("Saved message not found");

  const data = asData(row.data);
  if (row.kind === "media" && typeof data.publicId === "string" && isCloudinaryConfigured()) {
    try {
      await getCloudinary().uploader.destroy(data.publicId, {
        resource_type: (data.resourceType as "image" | "video" | "raw" | undefined) ?? "raw",
        type: "authenticated",
        invalidate: true,
      });
    } catch (err) {
      logger.warn({ err }, "Could not delete a saved message's file from Cloudinary");
    }
  }
  await row.deleteOne();
}

// ---------------------------------------------------------------------------
// The file of a saved media message
// ---------------------------------------------------------------------------

function signedFileUrl(data: SavedData): string {
  return getCloudinary().url(String(data.publicId), {
    resource_type: (data.resourceType as "image" | "video" | "raw" | undefined) ?? "raw",
    type: "authenticated",
    sign_url: true,
    secure: true,
  });
}

export async function openSavedFile(id: string): Promise<{ stream: Readable; mimeType: string; filename: string }> {
  const row = await WhatsappQuickReply.findById(id).lean();
  const data = asData(row?.data);
  if (!row || row.kind !== "media" || typeof data.publicId !== "string") throw ApiError.notFound("This saved message has no file");
  const response = await axios.get<Readable>(signedFileUrl(data), { responseType: "stream", timeout: 30_000 });
  return { stream: response.data, mimeType: str(data.mimeType) || "application/octet-stream", filename: str(data.filename) || "file" };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface DeliverOptions {
  source: "app" | "bot";
  sentBy?: string;
}

/**
 * Sends a saved message to a customer's WhatsApp id and records it in the chat.
 * The caller decides whether it is allowed (24-hour window, who may send).
 */
export async function deliverSaved(waId: string, savedId: string, options: DeliverOptions): Promise<void> {
  const row = await WhatsappQuickReply.findById(savedId).lean();
  if (!row) throw ApiError.notFound("Saved message not found");
  const dto = toDto(row);
  const data = asData(row.data);
  const record = { waId, source: options.source, sentBy: options.sentBy };

  switch (dto.kind) {
    case "text": {
      const id = await sendWhatsAppText(waId, dto.text);
      return recordOutbound({ ...record, waMessageId: id, text: dto.text });
    }
    case "buttons": {
      const titles = (data.buttons as string[]) ?? [];
      const id = await sendWhatsAppButtons(waId, {
        body: str(data.body),
        buttons: titles.map((title, i) => ({ id: `saved_btn_${i + 1}`, title })),
      });
      return recordOutbound({ ...record, waMessageId: id, text: dto.summary, type: "interactive" });
    }
    case "list": {
      const rows = ((data.rows as { title: string; description?: string }[]) ?? []).map((r, i) => ({ id: `saved_row_${i + 1}`, ...r }));
      const id = await sendWhatsAppMenu(waId, {
        header: str(data.header) || undefined,
        body: str(data.body),
        button: str(data.button),
        sectionTitle: str(data.sectionTitle) || "Options",
        rows,
      });
      return recordOutbound({ ...record, waMessageId: id, text: dto.summary, type: "interactive" });
    }
    case "cta": {
      const id = await sendWhatsAppCtaUrl(waId, {
        header: str(data.header) || undefined,
        body: str(data.body),
        footer: str(data.footer) || undefined,
        buttonText: str(data.buttonText),
        url: str(data.url),
      });
      return recordOutbound({ ...record, waMessageId: id, text: dto.summary, type: "interactive" });
    }
    case "location": {
      const location = {
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        name: str(data.name) || undefined,
        address: str(data.address) || undefined,
      };
      const id = await sendWhatsAppLocation(waId, location);
      return recordOutbound({ ...record, waMessageId: id, text: dto.summary, type: "location", location });
    }
    case "contact": {
      const id = await sendWhatsAppContacts(
        waId,
        [{ name: str(data.name), phone: str(data.phone), role: str(data.role) || undefined, email: str(data.email) || undefined }],
        company.legalName,
      );
      return recordOutbound({ ...record, waMessageId: id, text: dto.summary, type: "contacts" });
    }
    case "media": {
      if (!isCloudinaryConfigured()) throw ApiError.conflict("Cloudinary isn't set up on the server, so this file can't be sent");
      const bytes = await axios.get<ArrayBuffer>(signedFileUrl(data), { responseType: "arraybuffer", timeout: 30_000 });
      const buffer = Buffer.from(bytes.data);
      const mimeType = str(data.mimeType) || "application/octet-stream";
      const filename = str(data.filename) || "file";
      const kind = (str(data.mediaKind) || "document") as MediaKind;

      const mediaId = await uploadWhatsAppMedia({ buffer, mimetype: mimeType, originalname: filename });
      const caption = str(data.caption);
      const id = await sendWhatsAppMedia(waId, { kind, id: mediaId, caption: caption || undefined, filename });
      const label = kind === "document" ? `[Document] ${filename}` : `[${kind === "image" ? "Photo" : kind[0]!.toUpperCase() + kind.slice(1)}]`;
      return recordOutbound({
        ...record,
        waMessageId: id,
        text: caption ? `${label}\n${caption}` : label,
        type: kind,
        media: { kind, id: mediaId, mimeType, filename, caption: caption || undefined },
      });
    }
  }
}

export { resourceTypeFor };
