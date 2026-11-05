import { authenticatedFetch } from "@/lib/authenticatedFetch";

/**
 * Photos and files in chats are streamed by the server (which holds the Meta
 * token), so the browser fetches them with its login cookie and shows them from
 * an object URL. Results are remembered for the session so scrolling a chat
 * doesn't download the same photo twice.
 */

export class MediaError extends Error {
  constructor(
    message: string,
    /** True when the file is gone for good (Meta only keeps files about 30 days). */
    readonly expired = false,
  ) {
    super(message);
  }
}

const cache = new Map<string, string>();

async function errorFrom(response: Response): Promise<MediaError> {
  let message = "Couldn't load this file.";
  try {
    const body = (await response.json()) as { message?: unknown };
    if (typeof body.message === "string" && body.message) message = body.message;
  } catch {
    // not JSON: keep the generic text
  }
  return new MediaError(message, response.status === 410);
}

/** An object URL for the message's file, fetched once per session. */
export async function loadMediaUrl(messageId: string): Promise<string> {
  const cached = cache.get(messageId);
  if (cached) return cached;

  const response = await authenticatedFetch(`/api/whatsapp/media/${messageId}`);
  if (!response.ok) throw await errorFrom(response);

  const url = URL.createObjectURL(await response.blob());
  cache.set(messageId, url);
  return url;
}

/** Saves the file to the device under its own name. */
export async function downloadMedia(messageId: string, filename: string): Promise<void> {
  const url = await loadMediaUrl(messageId);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
