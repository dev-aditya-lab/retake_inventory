import type { MediaKind } from "./whatsappWebhook";

/** Pure helpers for chat media: where a file goes in Cloudinary and what to call it. */

export type CloudinaryResourceType = "image" | "video" | "raw";

/** Cloudinary files audio under "video"; documents are "raw". */
export function resourceTypeFor(kind: MediaKind): CloudinaryResourceType {
  if (kind === "image" || kind === "sticker") return "image";
  if (kind === "video" || kind === "audio") return "video";
  return "raw";
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export function extensionFor(mimeType: string | undefined, filename?: string): string {
  const fromName = filename ? /\.([A-Za-z0-9]{1,5})$/.exec(filename)?.[1] : undefined;
  if (fromName) return fromName.toLowerCase();
  return EXTENSIONS[(mimeType ?? "").split(";")[0]!.trim().toLowerCase()] ?? "bin";
}

/** A file name safe to put in a Content-Disposition header. */
export function safeFilename(name: string | undefined, fallback: string): string {
  const cleaned = (name ?? "").replace(/[\r\n"\/]+/g, "_").replace(/[^\x20-\x7E]/g, "_").trim();
  return cleaned || fallback;
}

/** Cloudinary folder for a save: one per month, so a busy shop's files stay browsable. */
export function mediaFolder(at: Date): string {
  return `whatsapp/${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}
