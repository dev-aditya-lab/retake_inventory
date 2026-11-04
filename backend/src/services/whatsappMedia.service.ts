import axios from "axios";
import { PassThrough, type Readable } from "stream";
import { getCloudinary, isCloudinaryConfigured } from "../config/cloudinary";
import { logger } from "../config/logger";
import { WhatsappMessage } from "../models/WhatsappMessage.model";
import { ApiError } from "../utils/ApiError";
import { extensionFor, mediaFolder, resourceTypeFor, safeFilename, type CloudinaryResourceType } from "../utils/whatsappMedia";
import type { MediaKind } from "../utils/whatsappWebhook";
import { graph } from "./metaGraph.service";
import { getWhatsappConfig } from "./whatsappConfig.service";
import { isAutoSaveMediaOn } from "./whatsappSettings.service";

/**
 * Chat media. Meta keeps a file for about 30 days and only hands out a link
 * that works for a few minutes, so every view asks Meta for a fresh link and
 * streams the bytes through the server (the token never reaches the browser).
 * "Saving" copies the file to Cloudinary, after which views come from there.
 * Saved files are stored as `authenticated` assets: nobody can open them
 * without a signed link, which only this server creates.
 */

export interface OpenedMedia {
  stream: Readable;
  mimeType: string;
  size?: number;
  filename: string;
  source: "cloudinary" | "meta";
}

const GONE_MESSAGE =
  "This file is no longer available from WhatsApp (Meta keeps media for about 30 days). If it was saved to Cloudinary you can still open it.";

/** The download for a Meta media id. Throws 410 when Meta no longer has it. */
async function openFromMeta(mediaId: string): Promise<{ stream: Readable; mimeType?: string; size?: number }> {
  const config = await getWhatsappConfig();

  let info: { url?: string; mime_type?: string; file_size?: number };
  try {
    info = await graph("GET", mediaId, { config, params: { phone_number_id: config.phoneNumberId } });
  } catch (err) {
    // An expired or foreign media id comes back as a Graph error; the person only needs to know it is gone.
    if (err instanceof ApiError && err.statusCode === 400) throw new ApiError(410, GONE_MESSAGE);
    throw err;
  }
  if (!info.url) throw new ApiError(410, GONE_MESSAGE);

  try {
    const response = await axios.get<Readable>(info.url, {
      responseType: "stream",
      headers: { Authorization: `Bearer ${config.accessToken}` },
      timeout: 30_000,
    });
    return {
      stream: response.data,
      mimeType: info.mime_type ?? String(response.headers["content-type"] ?? ""),
      size: info.file_size,
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response && [400, 404, 410].includes(err.response.status)) {
      throw new ApiError(410, GONE_MESSAGE);
    }
    logger.error({ err }, "Could not download WhatsApp media");
    throw ApiError.badRequest("Couldn't download that file from WhatsApp. Try again.");
  }
}

function signedUrl(publicId: string, resourceType: CloudinaryResourceType): string {
  return getCloudinary().url(publicId, { resource_type: resourceType, type: "authenticated", sign_url: true, secure: true });
}

/** The bytes of a stored message's media, from Cloudinary when saved, else from Meta. */
export async function openMessageMedia(messageId: string): Promise<OpenedMedia> {
  const message = await WhatsappMessage.findById(messageId).select("media").lean();
  const media = message?.media;
  if (!media) throw ApiError.notFound("This message has no file");

  const fallbackName = `${media.kind}-${messageId.slice(-6)}.${extensionFor(media.mimeType ?? undefined, media.filename ?? undefined)}`;
  const filename = safeFilename(media.filename ?? undefined, fallbackName);

  if (media.savedPublicId && isCloudinaryConfigured()) {
    const response = await axios.get<Readable>(signedUrl(media.savedPublicId, (media.savedResourceType as CloudinaryResourceType) ?? "raw"), {
      responseType: "stream",
      timeout: 30_000,
    });
    return {
      stream: response.data,
      mimeType: media.mimeType ?? String(response.headers["content-type"] ?? "application/octet-stream"),
      size: Number(response.headers["content-length"]) || undefined,
      filename,
      source: "cloudinary",
    };
  }

  if (!media.id) throw new ApiError(410, GONE_MESSAGE);
  const opened = await openFromMeta(media.id);
  return {
    stream: opened.stream,
    mimeType: media.mimeType ?? opened.mimeType ?? "application/octet-stream",
    size: opened.size,
    filename,
    source: "meta",
  };
}

interface UploadInput {
  source: Readable | Buffer;
  kind: MediaKind;
  mimeType?: string;
  filename?: string;
}

/** Uploads to Cloudinary as a private (`authenticated`) asset. */
export async function uploadToCloudinary({ source, kind, mimeType, filename }: UploadInput) {
  const cloudinary = getCloudinary();
  const resourceType = resourceTypeFor(kind);
  const random = Math.random().toString(36).slice(2, 10);
  // Raw files keep their extension inside the id; images and videos get theirs from the format.
  const publicId = resourceType === "raw" ? `${random}.${extensionFor(mimeType, filename)}` : random;

  return new Promise<{ publicId: string; resourceType: CloudinaryResourceType; bytes: number }>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, type: "authenticated", folder: mediaFolder(new Date()), public_id: publicId },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Cloudinary returned no result"));
        resolve({ publicId: result.public_id, resourceType, bytes: result.bytes });
      },
    );
    if (Buffer.isBuffer(source)) {
      upload.end(source);
    } else {
      source.on("error", reject);
      source.pipe(upload);
    }
  });
}

function requireCloudinary(): void {
  if (!isCloudinaryConfigured()) {
    throw ApiError.conflict("Cloudinary isn't set up on the server, so files can't be saved. Add the three CLOUDINARY_* settings.");
  }
}

/** Copies a message's file to Cloudinary. Safe to call twice: an already saved file is left alone. */
export async function saveMessageMedia(messageId: string): Promise<void> {
  requireCloudinary();
  const message = await WhatsappMessage.findById(messageId).select("media").lean();
  const media = message?.media;
  if (!media) throw ApiError.notFound("This message has no file");
  if (media.savedPublicId) return;
  if (!media.id) throw new ApiError(410, GONE_MESSAGE);

  const opened = await openFromMeta(media.id);
  const body = new PassThrough();
  opened.stream.on("error", (err) => body.destroy(err));
  opened.stream.pipe(body);

  let uploaded;
  try {
    uploaded = await uploadToCloudinary({
      source: body,
      kind: media.kind,
      mimeType: media.mimeType ?? opened.mimeType,
      filename: media.filename ?? undefined,
    });
  } catch (err) {
    logger.error({ err }, "Cloudinary upload of WhatsApp media failed");
    throw ApiError.badRequest("Couldn't save the file to Cloudinary. It may be too large for your plan.");
  }

  await WhatsappMessage.updateOne(
    { _id: messageId, "media.savedPublicId": { $exists: false } },
    {
      $set: {
        "media.savedPublicId": uploaded.publicId,
        "media.savedResourceType": uploaded.resourceType,
        "media.savedBytes": uploaded.bytes,
        "media.savedAt": new Date(),
      },
    },
  );
}

/**
 * Called right after a customer's message is stored: when an admin has turned
 * "save incoming files automatically" on, copy its file to Cloudinary. Never
 * throws, because the message is already safely stored either way.
 */
export async function autoSaveInboundMedia(waMessageId: string): Promise<void> {
  try {
    if (!isCloudinaryConfigured() || !(await isAutoSaveMediaOn())) return;
    const message = await WhatsappMessage.findOne({ waMessageId }).select("_id media").lean();
    if (!message?.media?.id) return;
    await saveMessageMedia(String(message._id));
  } catch (err) {
    logger.warn({ err, waMessageId }, "Automatic save of WhatsApp media failed");
  }
}

/** Remembers a copy that was uploaded while sending, so the sent file stays viewable after Meta drops it. */
export async function storeSentCopy(waMessageId: string | undefined, upload: { publicId: string; resourceType: CloudinaryResourceType; bytes: number }): Promise<void> {
  if (!waMessageId) return;
  await WhatsappMessage.updateOne(
    { waMessageId },
    {
      $set: {
        "media.savedPublicId": upload.publicId,
        "media.savedResourceType": upload.resourceType,
        "media.savedBytes": upload.bytes,
        "media.savedAt": new Date(),
      },
    },
  );
}
