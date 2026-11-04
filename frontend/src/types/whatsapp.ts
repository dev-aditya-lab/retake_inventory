export type ChatFilter = "all" | "unread" | "needs_reply" | "mine" | "unassigned" | "resolved";
export type ChatStatus = "open" | "resolved";

export interface ChatListItem {
  id: string;
  /** Customer's WhatsApp id: digits with country code. */
  waId: string;
  /** Directory name, else the name on their WhatsApp; may be empty. */
  name: string;
  isCustomer: boolean;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastDirection: "in" | "out" | null;
  unreadCount: number;
  needsHuman: boolean;
  windowOpen: boolean;
  status: ChatStatus;
  labels: string[];
  assignedToName: string | null;
}

export interface ChatListPage {
  items: ChatListItem[];
  total: number;
  page: number;
  limit: number;
}

export type MessageStatus = "received" | "sent" | "delivered" | "read" | "failed";
export type MessageSource = "customer" | "app" | "bot" | "business_app" | "note" | "broadcast";

export interface ChatMessage {
  id: string;
  direction: "in" | "out";
  type: string;
  text: string;
  status: MessageStatus;
  error: string | null;
  source: MessageSource;
  /** Staff member who sent it from the app. */
  sentByName: string | null;
  media: ChatMedia | null;
  location: { latitude: number; longitude: number; name: string; address: string } | null;
  /** The message this one answers (a quote). */
  replyTo: { text: string; direction: "in" | "out" | null } | null;
  customerReaction: string;
  staffReaction: string;
  timestamp: string;
}

export type MediaKind = "image" | "video" | "audio" | "document" | "sticker";

export interface ChatMedia {
  kind: MediaKind;
  mimeType: string;
  filename: string;
  caption: string;
  /** A recorded voice note rather than an audio file. */
  voice: boolean;
  /** A copy is in Cloudinary, so it stays available. */
  saved: boolean;
  /** Something can still be opened (a saved copy, or Meta's, which lasts about 30 days). */
  available: boolean;
}

export interface ChatThread {
  conversation: {
    id: string;
    waId: string;
    name: string;
    company: string;
    isCustomer: boolean;
    needsHuman: boolean;
    windowOpen: boolean;
    windowClosesAt: string | null;
    status: ChatStatus;
    labels: string[];
    assignedTo: { id: string; name: string } | null;
  };
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface WhatsappSummary {
  unreadChats: number;
  needsReply: number;
  /** Admins only; 0 for everyone else. */
  openAlerts: number;
  /** The admin master switch. When false nothing is sent and incoming messages are ignored. */
  serviceEnabled: boolean;
  media: { cloudinaryConfigured: boolean; autoSave: boolean };
}

export interface WhatsappAgent {
  id: string;
  name: string;
  role: string;
}

export interface ListInput {
  header?: string;
  body: string;
  button: string;
  sectionTitle: string;
  rows: { title: string; description?: string }[];
}

export interface CtaInput {
  header?: string;
  body: string;
  footer?: string;
  buttonText: string;
  url: string;
}

export interface LocationInput {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface ContactInput {
  name: string;
  phone: string;
  role?: string;
  email?: string;
}

export interface ConversationPatch {
  labels?: string[];
  assignedTo?: string | null;
  status?: ChatStatus;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface WhatsappAlert {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  quality: string;
  reason: string;
  updatedAt: string;
}

export interface WhatsappHealth {
  number: { event: string; limit: string; at: string } | null;
  templates: WhatsappTemplate[];
  alerts: WhatsappAlert[];
}

// ---------------------------------------------------------------------------
// Connection settings (admin)
// ---------------------------------------------------------------------------

export type ConfigSource = "app" | "env" | "none";

export interface ConfigField {
  value: string;
  source: ConfigSource;
}

export interface ConfigSecret {
  set: boolean;
  /** Masked, e.g. "EAAG••••9Zk1". The real secret never reaches the browser. */
  hint: string;
  source: ConfigSource;
}

export interface WhatsappConfig {
  phoneNumberId: ConfigField;
  businessAccountId: ConfigField;
  appId: ConfigField;
  apiVersion: ConfigField;
  accessToken: ConfigSecret;
  verifyToken: ConfigSecret;
  appSecret: ConfigSecret;
  displayPhoneNumber: string;
  verifiedName: string;
  lastCheckedAt: string | null;
  dedicatedEncryptionKey: boolean;
}

export type SecretName = "accessToken" | "verifyToken" | "appSecret";

/** Omitted = leave as is. An empty id clears it (falls back to the server). Secrets: empty leaves it, use `clear` to remove. */
export interface SaveWhatsappConfig {
  phoneNumberId?: string;
  businessAccountId?: string;
  appId?: string;
  apiVersion?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  clear?: SecretName[];
}

export interface ConnectionCheck {
  key: "credentials" | "phone" | "account" | "webhook";
  label: string;
  ok: boolean;
  detail: string;
}

export interface ConnectionResult {
  ok: boolean;
  checks: ConnectionCheck[];
  phone: { displayPhoneNumber: string; verifiedName: string; quality: string } | null;
}

// ---------------------------------------------------------------------------
// Templates and quick replies
// ---------------------------------------------------------------------------

export interface TemplateButton {
  type: string;
  text: string;
  url?: string;
  phone?: string;
}

export interface TemplateDetail extends WhatsappTemplate {
  parameterFormat: "POSITIONAL" | "NAMED";
  headerFormat: string;
  headerText: string;
  bodyText: string;
  footerText: string;
  headerVariables: string[];
  bodyVariables: string[];
  buttons: TemplateButton[];
  /** True once the full text is known (after a sync), so it can be previewed and sent. */
  hasContent: boolean;
}

export interface TemplateValues {
  header?: string[];
  body?: string[];
  headerMediaUrl?: string;
  buttonUrlValues?: string[];
}

export type NewTemplateButton =
  | { type: "QUICK_REPLY"; text: string }
  | { type: "URL"; text: string; url: string; example?: string }
  | { type: "PHONE_NUMBER"; text: string; phone: string };

export interface NewTemplate {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  header?: string;
  headerExample?: string;
  body: string;
  bodyExamples: string[];
  footer?: string;
  buttons: NewTemplateButton[];
}

export type SavedKind = "text" | "buttons" | "list" | "cta" | "location" | "contact" | "media";

/** A message in the shared library. Plain text is the old "quick reply". */
export interface SavedMessage {
  id: string;
  title: string;
  kind: SavedKind;
  /** The words, for kind "text". */
  text: string;
  /** The kind's settings (for a file: kind, filename, caption, size). */
  data: Record<string, unknown>;
  /** One line describing it. */
  summary: string;
  position: number;
}

/** Older code calls these "quick replies". */
export type QuickReply = SavedMessage;

export interface SavedInput {
  title: string;
  kind?: SavedKind;
  text?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Business profile, API status, usage, analytics
// ---------------------------------------------------------------------------

export interface BusinessProfile {
  about: string;
  address: string;
  description: string;
  email: string;
  websites: string[];
  /** A category code such as RETAIL. */
  vertical: string;
  profilePictureUrl: string;
  displayName: string;
  displayNameStatus: string;
  /** A name change waiting for WhatsApp's review. */
  pendingDisplayName: string;
}

export interface UpdateProfileInput {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
}

export interface ApiStatus {
  checkedAt: string;
  service: { enabled: boolean; apiVersion: string; configured: boolean };
  latencyMs: number | null;
  phone: {
    displayPhoneNumber: string;
    verifiedName: string;
    status: string;
    quality: string;
    nameStatus: string;
    pendingName: string;
    pendingNameStatus: string;
    platform: string;
    throughput: string;
    messagingLimit: string;
    accountMode: string;
    codeVerification: string;
    officialBusiness: boolean;
  } | null;
  account: {
    name: string;
    currency: string;
    reviewStatus: string;
    verification: string;
    canSendMessage: string;
    entities: { type: string; canSend: string }[];
  } | null;
  token: { valid: boolean; type: string; neverExpires: boolean; expiresAt: string | null; scopes: string[]; appName: string; appId: string } | null;
  webhook: { subscribed: boolean | null; subscribedApps: string[]; lastEventAt: string | null; lastCustomerMessageAt: string | null };
  problems: string[];
}

export type UsageRange = "7d" | "30d" | "90d" | "month";

export interface PricingSummary {
  totalCost: number;
  totalVolume: number;
  byCategory: { category: string; volume: number; cost: number; freeVolume: number }[];
  daily: { date: string; cost: number; volume: number }[];
}

export interface UsageData {
  range: UsageRange;
  counts: {
    allTime: { total: number; received: number; sent: number; conversations: number };
    range: { days: number; total: number; received: number; sent: number; newConversations: number; failed: number; delivered: number; read: number };
    daily: { date: string; received: number; sent: number }[];
    sentByType: { type: string; count: number }[];
  };
  bill: { available: boolean; currency: string; summary: PricingSummary | null; error: string | null };
}

export interface ResponseStats {
  count: number;
  avgMs: number;
  medianMs: number;
}

export interface AnalyticsData {
  range: UsageRange;
  responseTime: ResponseStats;
  team: {
    id: string;
    name: string;
    messagesSent: number;
    replies: number;
    avgResponseMs: number;
    medianResponseMs: number;
    openChats: number;
    resolvedChats: number;
  }[];
  /** Customer messages by hour of the day, index 0 = midnight (India time). */
  busyHours: number[];
  chats: { open: number; resolved: number; unassigned: number; needsReply: number };
  truncated: boolean;
}

export interface DeleteChatsResult {
  chats: number;
  messages: number;
  files: number;
}

// ---------------------------------------------------------------------------
// Broadcasts
// ---------------------------------------------------------------------------

export interface AudienceInput {
  allCustomers: boolean;
  customerTags: string[];
  labels: string[];
  numbers: string[];
}

export interface AudiencePreview {
  count: number;
  optedOut: number;
  tooMany: boolean;
  limit: number;
  sample: { waId: string; name: string }[];
}

export interface BroadcastCounts {
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

export type BroadcastStatus = "draft" | "sending" | "completed" | "cancelled" | "failed";

export interface Broadcast {
  id: string;
  name: string;
  templateName: string;
  language: string;
  status: BroadcastStatus;
  error: string;
  optedOutSkipped: number;
  audience: { allCustomers: boolean; customerTags: string[]; labels: string[]; numbers: number };
  counts: BroadcastCounts;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
}

export interface BroadcastDetail extends Broadcast {
  recipients: {
    items: { waId: string; name: string; status: string; error: string; sentAt: string | null }[];
    total: number;
    page: number;
    limit: number;
  };
}

export interface CreateBroadcastInput {
  name: string;
  templateId: string;
  values: TemplateValues;
  nameVariable?: number;
  audience: AudienceInput;
  start: boolean;
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

export type AutomationType = "keyword" | "welcome" | "away";

export interface Automation {
  id: string;
  name: string;
  type: AutomationType;
  enabled: boolean;
  keywords: string[];
  match: "contains" | "exact";
  reply: { kind: "text" | "saved"; text: string; savedId: string; savedTitle: string };
  timesUsed: number;
  lastUsedAt: string | null;
}

export interface AutomationInput {
  name: string;
  type: AutomationType;
  enabled: boolean;
  keywords: string[];
  match: "contains" | "exact";
  reply: { kind: "text"; text: string } | { kind: "saved"; savedId: string };
}

export interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}

/** Seven days, Sunday first. */
export interface BusinessHours {
  enabled: boolean;
  days: DayHours[];
}
