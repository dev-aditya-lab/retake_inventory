import { WhatsappConversation, type WhatsappConversationDoc } from "../models/WhatsappConversation.model";
import { ApiError } from "../utils/ApiError";
import { phoneKey } from "../utils/phone";
import { BOT_PAUSE_MS, isReplyWindowOpen, MAX_TEXT_LENGTH } from "../utils/whatsappChat";
import {
  buildTemplateComponents,
  classifyMedia,
  renderTemplateText,
  TemplateValueError,
  type TemplateValues,
} from "../utils/whatsappTemplates";
import {
  sendWhatsAppButtons,
  sendWhatsAppMedia,
  sendWhatsAppTemplate,
  uploadWhatsAppMedia,
} from "./whatsapp.service";
import { ensureConversation, recordOutbound } from "./whatsappChat.service";
import { getSendableTemplate } from "./whatsappTemplate.service";

/**
 * Everything staff can send from a chat besides plain text: approved templates
 * (allowed any time, so they also start conversations), photos / documents and
 * tap-to-answer buttons (both only inside the 24-hour window).
 */

async function loadConversation(id: string): Promise<WhatsappConversationDoc> {
  const conversation = await WhatsappConversation.findById(id);
  if (!conversation) throw ApiError.notFound("Chat not found");
  return conversation;
}

function requireWindow(conversation: WhatsappConversationDoc, what: string): void {
  if (!isReplyWindowOpen(conversation.lastInboundAt)) {
    throw ApiError.conflict(`The 24-hour reply window has closed, so ${what} can't be sent. Send a template instead.`);
  }
}

/** A person has taken over the chat: the bot steps back and the "needs a reply" flag clears. */
async function markHandled(conversation: WhatsappConversationDoc): Promise<void> {
  await WhatsappConversation.updateOne(
    { _id: conversation._id },
    { $set: { needsHuman: false, unreadCount: 0, botPausedUntil: new Date(Date.now() + BOT_PAUSE_MS) } },
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function sendTemplateToChat(userId: string, id: string, templateId: string, values: TemplateValues): Promise<void> {
  const conversation = await loadConversation(id);
  const template = await getSendableTemplate(templateId);

  let components;
  try {
    components = buildTemplateComponents(template, values);
  } catch (err) {
    if (err instanceof TemplateValueError) throw ApiError.badRequest(err.message);
    throw err;
  }

  const waMessageId = await sendWhatsAppTemplate(conversation.waId, template.name, template.language, components);
  await recordOutbound({
    waId: conversation.waId,
    waMessageId,
    text: renderTemplateText(template, values),
    source: "app",
    sentBy: userId,
    type: "template",
  });
  await markHandled(conversation);
}

// ---------------------------------------------------------------------------
// Photos and documents
// ---------------------------------------------------------------------------

const CAPTION_MAX = 1024;
const PLACEHOLDER = { image: "[Photo]", video: "[Video]", document: "[Document]" } as const;

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export async function sendMediaToChat(userId: string, id: string, file: UploadedFile, rawCaption: string): Promise<void> {
  const conversation = await loadConversation(id);
  requireWindow(conversation, "files");

  const checked = classifyMedia(file.mimetype, file.size);
  if (!checked.ok) throw ApiError.badRequest(checked.reason);

  const caption = rawCaption.trim();
  if (caption.length > CAPTION_MAX) throw ApiError.badRequest(`Captions can be at most ${CAPTION_MAX} characters`);

  const mediaId = await uploadWhatsAppMedia(file);
  const waMessageId = await sendWhatsAppMedia(conversation.waId, {
    kind: checked.kind,
    id: mediaId,
    caption: caption || undefined,
    filename: file.originalname,
  });

  const label = checked.kind === "document" ? `${PLACEHOLDER.document} ${file.originalname}` : PLACEHOLDER[checked.kind];
  await recordOutbound({
    waId: conversation.waId,
    waMessageId,
    text: caption ? `${label}\n${caption}` : label,
    source: "app",
    sentBy: userId,
    type: checked.kind,
  });
  await markHandled(conversation);
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export interface ButtonsInput {
  body: string;
  buttons: string[];
}

export async function sendButtonsToChat(userId: string, id: string, input: ButtonsInput): Promise<void> {
  const conversation = await loadConversation(id);
  requireWindow(conversation, "buttons");

  const body = input.body.trim();
  if (!body) throw ApiError.badRequest("Type the message first");
  if (body.length > MAX_TEXT_LENGTH) throw ApiError.badRequest("That message is too long");

  const titles = input.buttons.map((b) => b.trim()).filter(Boolean);
  if (titles.length < 1 || titles.length > 3) throw ApiError.badRequest("Add 1 to 3 buttons");
  if (new Set(titles.map((t) => t.toLowerCase())).size !== titles.length) throw ApiError.badRequest("Buttons must be different");

  const waMessageId = await sendWhatsAppButtons(conversation.waId, {
    body,
    buttons: titles.map((title, i) => ({ id: `staff_btn_${i + 1}`, title })),
  });
  await recordOutbound({
    waId: conversation.waId,
    waMessageId,
    text: `${body}\n[Buttons: ${titles.join(" | ")}]`,
    source: "app",
    sentBy: userId,
    type: "interactive",
  });
  await markHandled(conversation);
}

// ---------------------------------------------------------------------------
// New chat
// ---------------------------------------------------------------------------

/** Opens (or finds) the thread for a number so a template can be sent to it. Resolves the chat id. */
export async function startChat(rawPhone: string, name?: string): Promise<string> {
  const waId = phoneKey(rawPhone);
  if (!waId) throw ApiError.badRequest("Enter a valid phone number");
  const conversation = await ensureConversation(waId, name?.trim() || undefined);
  return String(conversation._id);
}
