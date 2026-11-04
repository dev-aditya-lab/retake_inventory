/**
 * Pure helpers for the WhatsApp Business profile (the "About" card customers
 * see when they tap the shop's name): the limits Meta enforces, reading what
 * Meta returns, and building the update. No network or env.
 */

export const BUSINESS_VERTICALS = [
  { value: "UNDEFINED", label: "Not set" },
  { value: "RETAIL", label: "Shopping and retail" },
  { value: "GROCERY", label: "Food and grocery" },
  { value: "RESTAURANT", label: "Restaurant" },
  { value: "APPAREL", label: "Clothing and apparel" },
  { value: "BEAUTY", label: "Beauty, spa and salon" },
  { value: "AUTO", label: "Automotive" },
  { value: "EDU", label: "Education" },
  { value: "ENTERTAIN", label: "Entertainment" },
  { value: "EVENT_PLAN", label: "Event planning and service" },
  { value: "FINANCE", label: "Finance and banking" },
  { value: "GOVT", label: "Public service" },
  { value: "HOTEL", label: "Hotel and lodging" },
  { value: "HEALTH", label: "Medical and health" },
  { value: "NONPROFIT", label: "Non-profit" },
  { value: "PROF_SERVICES", label: "Professional services" },
  { value: "TRAVEL", label: "Travel and transportation" },
  { value: "OTHER", label: "Other" },
] as const;

export type BusinessVertical = (typeof BUSINESS_VERTICALS)[number]["value"];

export const PROFILE_LIMITS = {
  about: 139,
  address: 256,
  description: 512,
  email: 128,
  website: 256,
  websites: 2,
  displayNameMin: 3,
  displayNameMax: 100,
} as const;

export interface BusinessProfile {
  about: string;
  address: string;
  description: string;
  email: string;
  websites: string[];
  vertical: BusinessVertical;
  /** A short-lived link to the current picture (Meta rotates it). Empty when none is set. */
  profilePictureUrl: string;
}

const VERTICAL_VALUES = new Set<string>(BUSINESS_VERTICALS.map((v) => v.value));

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The profile from `GET /{phone-number-id}/whatsapp_business_profile` (which wraps it in `data: [..]`). */
export function parseProfile(body: unknown): BusinessProfile {
  const raw = ((body as { data?: unknown[] } | undefined)?.data?.[0] ?? {}) as Record<string, unknown>;
  const vertical = text(raw.vertical).toUpperCase();
  return {
    about: text(raw.about),
    address: text(raw.address),
    description: text(raw.description),
    email: text(raw.email),
    websites: Array.isArray(raw.websites) ? raw.websites.filter((w): w is string => typeof w === "string") : [],
    vertical: (VERTICAL_VALUES.has(vertical) ? vertical : "UNDEFINED") as BusinessVertical,
    profilePictureUrl: text(raw.profile_picture_url),
  };
}

export interface ProfileUpdate {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: BusinessVertical;
}

/** Why an update would be refused, in plain words. Empty = fine. */
export function profileProblems(update: ProfileUpdate): string[] {
  const problems: string[] = [];
  const max = (value: string | undefined, limit: number, label: string) => {
    if (value !== undefined && value.length > limit) problems.push(`${label} can be at most ${limit} characters`);
  };

  if (update.about !== undefined && update.about.trim().length === 0) problems.push("The About line can't be empty");
  max(update.about, PROFILE_LIMITS.about, "About");
  max(update.address, PROFILE_LIMITS.address, "Address");
  max(update.description, PROFILE_LIMITS.description, "Description");
  max(update.email, PROFILE_LIMITS.email, "Email");

  if (update.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(update.email)) problems.push("Enter a valid email");

  if (update.websites) {
    if (update.websites.length > PROFILE_LIMITS.websites) problems.push(`You can add at most ${PROFILE_LIMITS.websites} links`);
    for (const site of update.websites) {
      if (!/^https?:\/\/\S+$/i.test(site)) problems.push(`"${site}" must be a full link starting with http:// or https://`);
      if (site.length > PROFILE_LIMITS.website) problems.push(`A link can be at most ${PROFILE_LIMITS.website} characters`);
    }
  }
  return problems;
}

/** The POST body for an update: only the fields given (an empty string clears a field). */
export function buildProfilePayload(update: ProfileUpdate, pictureHandle?: string): Record<string, unknown> {
  const payload: Record<string, unknown> = { messaging_product: "whatsapp" };
  if (update.about !== undefined) payload.about = update.about.trim();
  if (update.address !== undefined) payload.address = update.address.trim();
  if (update.description !== undefined) payload.description = update.description.trim();
  if (update.email !== undefined) payload.email = update.email.trim();
  if (update.websites !== undefined) payload.websites = update.websites.map((w) => w.trim()).filter(Boolean);
  if (update.vertical !== undefined && update.vertical !== "UNDEFINED") payload.vertical = update.vertical;
  if (pictureHandle) payload.profile_picture_handle = pictureHandle;
  return payload;
}

/** Display names are reviewed by WhatsApp; these are the checks Meta runs before it even looks. */
export function displayNameProblem(name: string): string | undefined {
  const trimmed = name.trim();
  if (trimmed.length < PROFILE_LIMITS.displayNameMin) return `The name needs at least ${PROFILE_LIMITS.displayNameMin} characters`;
  if (trimmed.length > PROFILE_LIMITS.displayNameMax) return `The name can be at most ${PROFILE_LIMITS.displayNameMax} characters`;
  if (/[^\p{L}\p{N}\s.,&'()\-]/u.test(trimmed)) return "Use letters, numbers and basic punctuation only. No emojis or symbols";
  if (/(www\.|\.com|\.in\b|https?:)/i.test(trimmed)) return "The name can't contain a web address";
  return undefined;
}

export const PROFILE_PICTURE_TYPES = ["image/jpeg", "image/png"] as const;
export const PROFILE_PICTURE_MAX_BYTES = 5 * 1024 * 1024;
