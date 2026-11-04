/**
 * Pure helpers for WhatsApp message templates: reading what Meta returns,
 * filling in {{variables}} for a send, and building the request that creates a
 * new template. No database, env or network here, so all of it is unit-tested.
 */

export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | "OTHER";

export interface TemplateButton {
  type: TemplateButtonType;
  text: string;
  /** URL buttons: the link, which may end in {{1}} (a per-message suffix). */
  url?: string;
  phone?: string;
}

export type HeaderFormat = "" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "LOCATION";

export interface ParsedTemplate {
  name: string;
  language: string;
  templateId?: string;
  status: string;
  category: string;
  quality: string;
  reason: string;
  parameterFormat: "POSITIONAL" | "NAMED";
  headerFormat: HeaderFormat;
  headerText: string;
  bodyText: string;
  footerText: string;
  /** Variable names in order of first use: "1","2" for numbered templates, or the names for named ones. */
  headerVariables: string[];
  bodyVariables: string[];
  buttons: TemplateButton[];
}

// ---------------------------------------------------------------------------
// Reading what Meta returns
// ---------------------------------------------------------------------------

const VARIABLE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** The {{variables}} used in `text`, each once, in order of first use. */
export function variablesIn(text: string): string[] {
  const seen: string[] = [];
  for (const match of text.matchAll(VARIABLE)) {
    const name = match[1]!;
    if (!seen.includes(name)) seen.push(name);
  }
  return seen;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const HEADER_FORMATS = new Set(["TEXT", "IMAGE", "VIDEO", "DOCUMENT", "LOCATION"]);

function parseButton(raw: unknown): TemplateButton {
  const b = record(raw);
  const type = str(b.type).toUpperCase();
  const text = str(b.text);
  switch (type) {
    case "QUICK_REPLY":
      return { type: "QUICK_REPLY", text };
    case "URL":
      return { type: "URL", text, url: str(b.url) };
    case "PHONE_NUMBER":
      return { type: "PHONE_NUMBER", text, phone: str(b.phone_number) };
    case "COPY_CODE":
      return { type: "COPY_CODE", text: text || "Copy code" };
    default:
      return { type: "OTHER", text };
  }
}

/** One entry of Meta's `GET /{waba}/message_templates` list, or undefined if it is not a usable template. */
export function parseMetaTemplate(raw: unknown): ParsedTemplate | undefined {
  const t = record(raw);
  const name = str(t.name);
  const language = str(t.language);
  if (!name || !language) return undefined;

  const components = Array.isArray(t.components) ? t.components.map(record) : [];
  const find = (type: string) => components.find((c) => str(c.type).toUpperCase() === type);

  const header = find("HEADER");
  const body = find("BODY");
  const footer = find("FOOTER");
  const buttons = find("BUTTONS");

  const headerFormatRaw = str(header?.format).toUpperCase();
  const headerFormat = (HEADER_FORMATS.has(headerFormatRaw) ? headerFormatRaw : "") as HeaderFormat;
  const headerText = headerFormat === "TEXT" ? str(header?.text) : "";
  const bodyText = str(body?.text);

  const quality = record(t.quality_score);
  const rejected = str(t.rejected_reason).toUpperCase();

  return {
    name,
    language,
    templateId: str(t.id) || undefined,
    status: str(t.status).toUpperCase(),
    category: str(t.category).toUpperCase(),
    quality: str(quality.score).toUpperCase(),
    reason: rejected && rejected !== "NONE" ? rejected : "",
    parameterFormat: str(t.parameter_format).toUpperCase() === "NAMED" ? "NAMED" : "POSITIONAL",
    headerFormat,
    headerText,
    bodyText,
    footerText: str(footer?.text),
    headerVariables: variablesIn(headerText),
    bodyVariables: variablesIn(bodyText),
    buttons: Array.isArray(buttons?.buttons) ? (buttons.buttons as unknown[]).map(parseButton) : [],
  };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface TemplateValues {
  header?: string[];
  body?: string[];
  /** Public https link for an IMAGE / VIDEO / DOCUMENT header. */
  headerMediaUrl?: string;
  /** Suffix for each URL button that ends in {{1}}, in button order. */
  buttonUrlValues?: string[];
}

export class TemplateValueError extends Error {}

/** Meta rejects newlines, tabs and runs of 4+ spaces inside a template variable. */
export function cleanVariable(value: string): string {
  return value.replace(/\s*[\r\n\t]+\s*/g, " ").replace(/ {4,}/g, "   ").trim();
}

function textParameters(names: string[], values: string[] | undefined, format: ParsedTemplate["parameterFormat"], where: string) {
  if (names.length === 0) return [];
  const given = (values ?? []).map(cleanVariable);
  if (given.length < names.length || given.slice(0, names.length).some((v) => !v)) {
    throw new TemplateValueError(`Fill in all ${names.length} ${where} value${names.length === 1 ? "" : "s"}`);
  }
  return names.map((name, i) => ({
    type: "text" as const,
    ...(format === "NAMED" ? { parameter_name: name } : {}),
    text: given[i]!,
  }));
}

export interface SendComponent {
  type: string;
  sub_type?: string;
  index?: string;
  parameters?: unknown[];
}

/** The `components` array for a Cloud API template send. Throws TemplateValueError if values are missing. */
export function buildTemplateComponents(template: ParsedTemplate, values: TemplateValues = {}): SendComponent[] {
  const components: SendComponent[] = [];

  if (template.headerFormat === "TEXT") {
    const parameters = textParameters(template.headerVariables, values.header, template.parameterFormat, "header");
    if (parameters.length > 0) components.push({ type: "header", parameters });
  } else if (template.headerFormat === "IMAGE" || template.headerFormat === "VIDEO" || template.headerFormat === "DOCUMENT") {
    const link = values.headerMediaUrl?.trim();
    if (!link || !/^https:\/\/\S+$/i.test(link)) {
      throw new TemplateValueError(`This template needs a public https link for its ${template.headerFormat.toLowerCase()} header`);
    }
    const kind = template.headerFormat.toLowerCase();
    components.push({ type: "header", parameters: [{ type: kind, [kind]: { link } }] });
  }

  const bodyParameters = textParameters(template.bodyVariables, values.body, template.parameterFormat, "body");
  if (bodyParameters.length > 0) components.push({ type: "body", parameters: bodyParameters });

  let urlIndex = 0;
  template.buttons.forEach((button, index) => {
    if (button.type !== "URL" || !button.url || variablesIn(button.url).length === 0) return;
    const suffix = cleanVariable(values.buttonUrlValues?.[urlIndex] ?? "");
    urlIndex += 1;
    if (!suffix) throw new TemplateValueError(`Fill in the link part for the "${button.text}" button`);
    components.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: suffix }] });
  });

  return components;
}

function fill(text: string, names: string[], values: string[] | undefined): string {
  const byName = new Map(names.map((name, i) => [name, cleanVariable(values?.[i] ?? "")]));
  return text.replace(VARIABLE, (whole, name: string) => byName.get(name) || whole);
}

/** What the chat thread shows for a template we sent: the header, body and footer with the values filled in. */
export function renderTemplateText(template: ParsedTemplate, values: TemplateValues = {}): string {
  const parts = [
    template.headerFormat === "TEXT" ? fill(template.headerText, template.headerVariables, values.header) : "",
    fill(template.bodyText, template.bodyVariables, values.body),
    template.footerText,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : `[Template: ${template.name}]`;
}

// ---------------------------------------------------------------------------
// Creating a template
// ---------------------------------------------------------------------------

export const TEMPLATE_NAME_PATTERN = /^[a-z0-9_]{1,512}$/;
export const TEMPLATE_LIMITS = { header: 60, body: 1024, footer: 60, buttonText: 25, buttons: 3, example: 100 } as const;

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
  /** One sample value per {{n}} in the body. Meta reviews the template against these. */
  bodyExamples: string[];
  footer?: string;
  buttons: NewTemplateButton[];
}

/** Problems that would make Meta reject the template, caught before we ask. Empty = fine. */
export function templateProblems(t: NewTemplate): string[] {
  const problems: string[] = [];

  const bodyVars = variablesIn(t.body);
  const expected = bodyVars.map((_, i) => String(i + 1));
  if (bodyVars.join(",") !== expected.join(",")) {
    problems.push("Body variables must be numbered {{1}}, {{2}}, ... in order");
  }
  if (/^\s*\{\{/.test(t.body) || /\}\}\s*$/.test(t.body)) {
    problems.push("The body can't start or end with a variable");
  }
  if (t.bodyExamples.length !== bodyVars.length || t.bodyExamples.some((e) => !e.trim())) {
    problems.push(`Give a sample value for each of the ${bodyVars.length} body variable${bodyVars.length === 1 ? "" : "s"}`);
  }

  const headerVars = t.header ? variablesIn(t.header) : [];
  if (headerVars.length > 1 || (headerVars.length === 1 && headerVars[0] !== "1")) {
    problems.push("The header can have at most one variable, written {{1}}");
  }
  if (headerVars.length === 1 && !t.headerExample?.trim()) problems.push("Give a sample value for the header variable");

  if (t.footer && variablesIn(t.footer).length > 0) problems.push("The footer can't contain variables");

  const urlButtons = t.buttons.filter((b) => b.type === "URL");
  for (const b of urlButtons) {
    const vars = variablesIn(b.url);
    if (!/^https:\/\//i.test(b.url)) problems.push(`The "${b.text}" button link must start with https://`);
    if (vars.length > 1 || (vars.length === 1 && (vars[0] !== "1" || !b.url.trim().endsWith("{{1}}")))) {
      problems.push(`The "${b.text}" button link can only have {{1}} at the very end`);
    }
  }

  return problems;
}

/** The body of `POST /{waba}/message_templates`. Call templateProblems() first. */
export function buildCreateTemplatePayload(t: NewTemplate): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];

  if (t.header?.trim()) {
    const hasVar = variablesIn(t.header).length > 0;
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: t.header.trim(),
      ...(hasVar ? { example: { header_text: [t.headerExample!.trim()] } } : {}),
    });
  }

  components.push({
    type: "BODY",
    text: t.body.trim(),
    ...(t.bodyExamples.length > 0 ? { example: { body_text: [t.bodyExamples.map((e) => e.trim())] } } : {}),
  });

  if (t.footer?.trim()) components.push({ type: "FOOTER", text: t.footer.trim() });

  if (t.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: t.buttons.map((b) => {
        switch (b.type) {
          case "QUICK_REPLY":
            return { type: "QUICK_REPLY", text: b.text.trim() };
          case "PHONE_NUMBER":
            return { type: "PHONE_NUMBER", text: b.text.trim(), phone_number: b.phone.trim() };
          case "URL":
            return {
              type: "URL",
              text: b.text.trim(),
              url: b.url.trim(),
              ...(variablesIn(b.url).length > 0 ? { example: [b.example?.trim() || `${b.url.trim().replace(/\{\{1\}\}$/, "")}example`] } : {}),
            };
        }
      }),
    });
  }

  return { name: t.name, language: t.language, category: t.category, components };
}

// ---------------------------------------------------------------------------
// Media for chat messages
// ---------------------------------------------------------------------------

export type MediaKind = "image" | "document" | "video" | "audio";

const MB = 1024 * 1024;

const MEDIA_RULES: { kind: MediaKind; mimes: readonly string[]; maxBytes: number }[] = [
  { kind: "image", mimes: ["image/jpeg", "image/png"], maxBytes: 5 * MB },
  { kind: "video", mimes: ["video/mp4", "video/3gpp"], maxBytes: 16 * MB },
  { kind: "audio", mimes: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"], maxBytes: 16 * MB },
  {
    kind: "document",
    mimes: [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    maxBytes: 16 * MB,
  },
];

/** The file we cap uploads at, so multer can reject oversize bodies early. */
export const MAX_MEDIA_BYTES = 16 * MB;

/** Which WhatsApp media kind a file is, or why it can't be sent. */
export function classifyMedia(mime: string, size: number): { ok: true; kind: MediaKind } | { ok: false; reason: string } {
  const type = mime.toLowerCase().split(";")[0]!.trim();
  const rule = MEDIA_RULES.find((r) => r.mimes.includes(type));
  if (!rule) return { ok: false, reason: "WhatsApp accepts JPEG/PNG photos, MP4 videos, audio (MP3, AAC, M4A, OGG, AMR) and PDF, Word, Excel, PowerPoint or text files" };
  if (size > rule.maxBytes) {
    return { ok: false, reason: `That ${rule.kind} is too large. The limit is ${Math.round(rule.maxBytes / MB)} MB` };
  }
  return { ok: true, kind: rule.kind };
}
