import { WhatsappTemplate } from "../models/WhatsappTemplate.model";
import { ApiError } from "../utils/ApiError";
import {
  buildCreateTemplatePayload,
  parseMetaTemplate,
  templateProblems,
  type NewTemplate,
  type ParsedTemplate,
} from "../utils/whatsappTemplates";
import { graph } from "./metaGraph.service";
import { getWhatsappConfig } from "./whatsappConfig.service";

/**
 * Message templates: pulling the list (with text) from Meta, creating and
 * deleting them there, and keeping a local copy so staff can pick one to send.
 */

const PAGE_SIZE = 100;
/** Safety stop so a misbehaving cursor can never loop forever. */
const MAX_PAGES = 20;

async function wabaId(): Promise<string> {
  const id = (await getWhatsappConfig()).businessAccountId;
  if (!id) {
    throw ApiError.badRequest("Add the WhatsApp Business Account ID under WhatsApp > Settings to manage templates");
  }
  return id;
}

export interface TemplateDto {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  quality: string;
  reason: string;
  parameterFormat: "POSITIONAL" | "NAMED";
  headerFormat: string;
  headerText: string;
  bodyText: string;
  footerText: string;
  headerVariables: string[];
  bodyVariables: string[];
  buttons: { type: string; text: string; url?: string; phone?: string }[];
  /** True when the full text is known (after a sync), so it can be previewed and sent. */
  hasContent: boolean;
  updatedAt: Date;
}

type TemplateRow = {
  _id: unknown;
  name: string;
  language: string;
  status?: string | null;
  category?: string | null;
  quality?: string | null;
  reason?: string | null;
  parameterFormat?: string | null;
  headerFormat?: string | null;
  headerText?: string | null;
  bodyText?: string | null;
  footerText?: string | null;
  headerVariables?: string[] | null;
  bodyVariables?: string[] | null;
  buttons?: { type: string; text?: string | null; url?: string | null; phone?: string | null }[] | null;
  updatedAt: Date;
};

export function toTemplateDto(t: TemplateRow): TemplateDto {
  return {
    id: String(t._id),
    name: t.name,
    language: t.language,
    status: t.status ?? "",
    category: t.category ?? "",
    quality: t.quality ?? "",
    reason: t.reason ?? "",
    parameterFormat: t.parameterFormat === "NAMED" ? "NAMED" : "POSITIONAL",
    headerFormat: t.headerFormat ?? "",
    headerText: t.headerText ?? "",
    bodyText: t.bodyText ?? "",
    footerText: t.footerText ?? "",
    headerVariables: t.headerVariables ?? [],
    bodyVariables: t.bodyVariables ?? [],
    buttons: (t.buttons ?? []).map((b) => ({
      type: b.type,
      text: b.text ?? "",
      ...(b.url ? { url: b.url } : {}),
      ...(b.phone ? { phone: b.phone } : {}),
    })),
    hasContent: !!t.bodyText,
    updatedAt: t.updatedAt,
  };
}

export async function listTemplates(options: { sendableOnly?: boolean } = {}): Promise<TemplateDto[]> {
  // Rows created only by webhooks have no text yet ($ne alone would match a missing field too).
  // Authentication templates carry login codes (see auth.service); they are never offered for chats or broadcasts.
  const query = options.sendableOnly
    ? { status: "APPROVED", category: { $ne: "AUTHENTICATION" }, bodyText: { $exists: true, $ne: "" } }
    : {};
  const rows = await WhatsappTemplate.find(query).sort({ name: 1, language: 1 }).lean();
  return rows.map(toTemplateDto);
}

/** Loads a template for sending. Throws if it isn't one we can send. */
export async function getSendableTemplate(id: string): Promise<ParsedTemplate> {
  const row = await WhatsappTemplate.findById(id).lean();
  if (!row) throw ApiError.notFound("Template not found");
  if (row.status !== "APPROVED") {
    throw ApiError.conflict(`This template can't be sent yet (status: ${(row.status || "unknown").toLowerCase()})`);
  }
  if (!row.bodyText) throw ApiError.conflict("Sync the templates first so the message text is known");
  if (row.category === "AUTHENTICATION") {
    throw ApiError.conflict("This template is only used for login codes and can't be sent to customers");
  }
  return {
    name: row.name,
    language: row.language,
    templateId: row.templateId ?? undefined,
    status: row.status ?? "",
    category: row.category ?? "",
    quality: row.quality ?? "",
    reason: row.reason ?? "",
    parameterFormat: row.parameterFormat === "NAMED" ? "NAMED" : "POSITIONAL",
    headerFormat: (row.headerFormat ?? "") as ParsedTemplate["headerFormat"],
    headerText: row.headerText ?? "",
    bodyText: row.bodyText ?? "",
    footerText: row.footerText ?? "",
    headerVariables: row.headerVariables ?? [],
    bodyVariables: row.bodyVariables ?? [],
    buttons: (row.buttons ?? []).map((b) => ({
      type: b.type as ParsedTemplate["buttons"][number]["type"],
      text: b.text ?? "",
      ...(b.url ? { url: b.url } : {}),
      ...(b.phone ? { phone: b.phone } : {}),
    })),
  };
}

function contentFields(t: ParsedTemplate) {
  return {
    status: t.status,
    category: t.category,
    quality: t.quality,
    reason: t.reason,
    parameterFormat: t.parameterFormat,
    headerFormat: t.headerFormat,
    headerText: t.headerText,
    bodyText: t.bodyText,
    footerText: t.footerText,
    headerVariables: t.headerVariables,
    bodyVariables: t.bodyVariables,
    buttons: t.buttons,
    ...(t.templateId ? { templateId: t.templateId } : {}),
    syncedAt: new Date(),
  };
}

interface MetaTemplatePage {
  data?: unknown[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/**
 * Replaces the local template list with Meta's. Templates Meta no longer has
 * (deleted in Business Manager) are removed here too. Resolves what changed.
 */
export async function syncTemplates(): Promise<{ total: number; removed: number }> {
  const id = await wabaId();
  const parsed: ParsedTemplate[] = [];
  let after: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await graph<MetaTemplatePage>("GET", `${id}/message_templates`, {
      params: {
        fields: "id,name,language,status,category,quality_score,rejected_reason,parameter_format,components",
        limit: PAGE_SIZE,
        after,
      },
    });
    for (const raw of result.data ?? []) {
      const template = parseMetaTemplate(raw);
      if (template) parsed.push(template);
    }
    after = result.paging?.next ? result.paging.cursors?.after : undefined;
    if (!after) break;
  }

  if (parsed.length > 0) {
    await WhatsappTemplate.bulkWrite(
      parsed.map((t) => ({
        updateOne: {
          filter: { name: t.name, language: t.language },
          // Mongoose types the buttons field as a DocumentArray; a plain array is what $set accepts at runtime.
          update: { $set: contentFields(t), $setOnInsert: { name: t.name, language: t.language } } as never,
          upsert: true,
        },
      })),
    );
  }

  // Only prune when Meta actually answered with a list: an empty answer is more likely a permissions slip than "no templates".
  let removed = 0;
  if (parsed.length > 0) {
    const keep = parsed.map((t) => ({ name: t.name, language: t.language }));
    const result = await WhatsappTemplate.deleteMany({
      $nor: keep.map((k) => ({ name: k.name, language: k.language })),
    });
    removed = result.deletedCount ?? 0;
  }

  return { total: parsed.length, removed };
}

export async function createTemplate(input: NewTemplate): Promise<TemplateDto> {
  const problems = templateProblems(input);
  if (problems.length > 0) throw ApiError.badRequest(problems[0]!, problems);

  const id = await wabaId();
  const created = await graph<{ id?: string; status?: string; category?: string }>("POST", `${id}/message_templates`, {
    data: buildCreateTemplatePayload(input),
  });

  // Store what we sent right away (status as Meta reports it, normally PENDING) so it shows in the list.
  const parsed = parseMetaTemplate({
    id: created.id,
    name: input.name,
    language: input.language,
    status: created.status ?? "PENDING",
    category: created.category ?? input.category,
    components: (buildCreateTemplatePayload(input) as { components: unknown[] }).components,
  })!;
  const row = await WhatsappTemplate.findOneAndUpdate(
    { name: parsed.name, language: parsed.language },
    { $set: contentFields(parsed), $setOnInsert: { name: parsed.name, language: parsed.language } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return toTemplateDto(row!);
}

/** Deletes every language of a template by name, on Meta and here. */
export async function deleteTemplate(name: string): Promise<void> {
  const id = await wabaId();
  await graph("DELETE", `${id}/message_templates`, { params: { name } });
  await WhatsappTemplate.deleteMany({ name });
}
