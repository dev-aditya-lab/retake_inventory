/**
 * Pure helpers for Web Push: what a notification says and which subscription
 * addresses we are willing to call. Nothing here touches the network.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Page to open when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other (one per chat, not one per message). */
  tag?: string;
}

const MAX_TITLE = 60;
const MAX_BODY = 140;

function clip(value: string, max: number): string {
  const single = value.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

/** A customer wrote and a person should look: shown with their name and the start of the message. */
export function chatPush(input: { customer: string; preview: string; conversationId: string }): PushPayload {
  return {
    title: clip(input.customer || "New WhatsApp message", MAX_TITLE),
    body: clip(input.preview || "New message", MAX_BODY),
    url: `/whatsapp/${input.conversationId}`,
    tag: `wa-chat-${input.conversationId}`,
  };
}

/** A WhatsApp account problem an admin should know about (template paused, number flagged, ...). */
export function alertPush(input: { title: string; detail: string }): PushPayload {
  return {
    title: "WhatsApp account alert",
    body: clip(input.detail ? `${input.title}. ${input.detail}` : input.title, MAX_BODY),
    url: "/whatsapp/health",
    tag: "wa-alert",
  };
}

export const testPush: PushPayload = {
  title: "Notifications are on",
  body: "You'll be told here when a customer needs a reply.",
  url: "/whatsapp",
  tag: "push-test",
};

/**
 * The push services browsers use. A subscription's endpoint is a URL the
 * server will POST to, so accepting any URL a signed-in user submits would let
 * them aim the server at internal addresses (SSRF). Only these hosts are real
 * push services (Chrome/Edge/Android, Firefox, Safari/iOS, Windows).
 */
const PUSH_HOSTS = new Set([
  "fcm.googleapis.com", // Chrome, Edge, Android
  "android.googleapis.com", // older Chrome/Android
]);
const PUSH_HOST_SUFFIXES = [
  ".push.services.mozilla.com", // Firefox
  ".push.apple.com", // Safari, iOS home-screen apps
  ".notify.windows.com", // Windows Notification Service
] as const;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
