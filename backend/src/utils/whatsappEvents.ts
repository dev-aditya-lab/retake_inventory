/**
 * Turns the non-message webhook fields Meta can send (template reviews, number
 * quality, account notices, ...) into something we can show: an optional
 * template-state patch and an optional alert. Pure and defensive: Meta's
 * payloads vary by field and version, so every read tolerates a missing key.
 */

export type AlertSeverity = "info" | "warning" | "critical";

export interface AlertDraft {
  /** The webhook field it came from. */
  kind: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  data?: Record<string, unknown>;
}

export interface TemplateRef {
  name: string;
  language: string;
  templateId?: string;
}

export interface TemplatePatch {
  status?: string;
  category?: string;
  quality?: string;
  reason?: string;
}

export interface ChangeEffect {
  template?: { ref: TemplateRef; patch: TemplatePatch };
  alert?: AlertDraft;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

/** "PENDING_DELETION" -> "pending deletion". */
function words(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

/** A short single-line rendering of an unknown payload, for alert details. */
function summarize(value: unknown, max = 300): string {
  let json: string;
  try {
    json = JSON.stringify(value) ?? "";
  } catch {
    json = "";
  }
  return json.length > max ? `${json.slice(0, max)}...` : json;
}

function templateRef(v: Record<string, unknown>): TemplateRef | undefined {
  const name = text(v.message_template_name) ?? text(v.name);
  const language = text(v.message_template_language) ?? text(v.language);
  if (!name || !language) return undefined;
  return { name, language, templateId: text(v.message_template_id) };
}

const BAD_TEMPLATE_EVENTS = new Set(["REJECTED", "DISABLED", "PAUSED"]);
const WARN_TEMPLATE_EVENTS = new Set(["FLAGGED", "PENDING_DELETION"]);
const BAD_ACCOUNT_WORDS = /DISABLED|VIOLATION|RESTRICT|BANNED|DELETED|SUSPEND/i;

function templateStatus(v: Record<string, unknown>): ChangeEffect {
  const event = (text(v.event) ?? "UNKNOWN").toUpperCase();
  const ref = templateRef(v);
  const reasonRaw = text(v.reason);
  const reason = reasonRaw && reasonRaw.toUpperCase() !== "NONE" ? reasonRaw : "";
  const severity: AlertSeverity = BAD_TEMPLATE_EVENTS.has(event) ? "critical" : WARN_TEMPLATE_EVENTS.has(event) ? "warning" : "info";

  return {
    template: ref ? { ref, patch: { status: event, ...(reason ? { reason } : {}) } } : undefined,
    alert: {
      kind: "message_template_status_update",
      severity,
      title: `Template ${ref ? `"${ref.name}"` : ""} ${words(event)}`.replace(/\s+/g, " ").trim(),
      detail: reason ? `Reason: ${reason}` : "",
      data: { event, ...(ref ?? {}) },
    },
  };
}

function templateQuality(v: Record<string, unknown>): ChangeEffect {
  const next = (text(v.new_quality_score) ?? "UNKNOWN").toUpperCase();
  const previous = text(v.previous_quality_score);
  const ref = templateRef(v);
  const severity: AlertSeverity = next === "RED" ? "critical" : next === "YELLOW" ? "warning" : "info";

  return {
    template: ref ? { ref, patch: { quality: next } } : undefined,
    alert: {
      kind: "message_template_quality_update",
      severity,
      title: `Template ${ref ? `"${ref.name}"` : ""} quality is now ${next.toLowerCase()}`.replace(/\s+/g, " ").trim(),
      detail: previous ? `Was ${previous.toLowerCase()}.` : "",
      data: { previous, next, ...(ref ?? {}) },
    },
  };
}

function templateCategory(v: Record<string, unknown>): ChangeEffect {
  const ref = templateRef(v);
  const next = text(v.new_category) ?? text(v.correct_category) ?? "";
  const previous = text(v.previous_category) ?? "";
  return {
    template: ref && next ? { ref, patch: { category: next } } : undefined,
    alert: {
      kind: "template_category_update",
      severity: "warning",
      title: `Template ${ref ? `"${ref.name}"` : ""} category changed`.replace(/\s+/g, " ").trim(),
      detail: previous && next ? `${previous} -> ${next}. Message pricing can change with the category.` : "",
      data: { previous, next, ...(ref ?? {}) },
    },
  };
}

function phoneQuality(v: Record<string, unknown>): ChangeEffect {
  const event = (text(v.event) ?? "UNKNOWN").toUpperCase();
  const limit = text(v.current_limit);
  const severity: AlertSeverity = event === "FLAGGED" ? "critical" : event === "DOWNGRADE" ? "warning" : "info";
  return {
    alert: {
      kind: "phone_number_quality_update",
      severity,
      title: `WhatsApp number ${words(event)}`,
      detail: limit ? `Messaging limit: ${limit}` : "",
      data: { event, currentLimit: limit, displayPhoneNumber: text(v.display_phone_number) },
    },
  };
}

function accountAlert(v: Record<string, unknown>): ChangeEffect {
  const level = (text(v.alert_severity) ?? "").toUpperCase();
  const severity: AlertSeverity = level === "CRITICAL" ? "critical" : level === "WARNING" ? "warning" : "info";
  return {
    alert: {
      kind: "account_alerts",
      severity,
      title: text(v.alert_type) ? words(text(v.alert_type)!) : "WhatsApp account alert",
      detail: text(v.alert_description) ?? "",
      data: v,
    },
  };
}

function accountUpdate(v: Record<string, unknown>): ChangeEffect {
  const event = (text(v.event) ?? "UNKNOWN").toUpperCase();
  return {
    alert: {
      kind: "account_update",
      severity: BAD_ACCOUNT_WORDS.test(event) ? "critical" : "info",
      title: `WhatsApp account: ${words(event)}`,
      detail: summarize(v),
      data: v,
    },
  };
}

function decision(kind: string, label: string, v: Record<string, unknown>, badSeverity: AlertSeverity): ChangeEffect {
  const result = (text(v.decision) ?? "UNKNOWN").toUpperCase();
  return {
    alert: {
      kind,
      severity: result === "REJECTED" ? badSeverity : "info",
      title: `${label}: ${words(result)}`,
      detail: text(v.rejection_reason) ?? text(v.requested_verified_name) ?? "",
      data: v,
    },
  };
}

function calls(v: Record<string, unknown>): ChangeEffect {
  const first = Array.isArray(v.calls) ? asRecord(v.calls[0]) : {};
  const from = text(first.from);
  return {
    alert: {
      kind: "calls",
      severity: "info",
      title: from ? `WhatsApp call from ${from}` : "WhatsApp call activity",
      detail: text(first.event) ? `Event: ${text(first.event)}` : "",
      data: v,
    },
  };
}

/** Fields we know and handle explicitly; anything else falls to `generic`. */
const HANDLERS: Record<string, (v: Record<string, unknown>) => ChangeEffect> = {
  message_template_status_update: templateStatus,
  message_template_quality_update: templateQuality,
  template_category_update: templateCategory,
  phone_number_quality_update: phoneQuality,
  account_alerts: accountAlert,
  account_update: accountUpdate,
  account_review_update: (v) => decision("account_review_update", "Account review", v, "critical"),
  phone_number_name_update: (v) => decision("phone_number_name_update", "Display name", v, "warning"),
  calls,
};

/** Fields worth an alert even without a dedicated handler (rare, account-level). */
const ATTENTION_FIELDS: Record<string, AlertSeverity> = {
  business_status_update: "warning",
  business_capability_update: "info",
  security: "warning",
  payment_configuration_update: "info",
  flows: "info",
  user_preferences: "info",
};

/** Fields that are pure bookkeeping: logged raw, no alert, no template change. */
const QUIET_FIELDS = new Set([
  "message_template_components_update",
  "history",
  "message_echoes",
  "smb_message_echoes",
  "smb_app_state_sync",
  "messaging_handovers",
  "partner_solutions",
  "automatic_events",
]);

export function isQuietField(field: string): boolean {
  return QUIET_FIELDS.has(field) || field.startsWith("group_");
}

/**
 * What a non-message webhook change means. An empty object means "nothing to
 * act on" (the raw event is still logged by the caller).
 */
export function interpretChange(field: string, value: unknown): ChangeEffect {
  const v = asRecord(value);

  const handler = HANDLERS[field];
  if (handler) return handler(v);

  if (field === "message_template_components_update") {
    const ref = templateRef(v);
    return ref ? { template: { ref, patch: {} } } : {};
  }

  if (isQuietField(field)) return {};

  const severity = ATTENTION_FIELDS[field] ?? "info";
  return {
    alert: {
      kind: field,
      severity,
      title: `WhatsApp: ${words(field)}`,
      detail: summarize(v),
      data: v,
    },
  };
}
