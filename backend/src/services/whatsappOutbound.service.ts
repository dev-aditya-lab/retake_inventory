import { company } from "../config/company";
import { isCloudinaryConfigured } from "../config/cloudinary";
import { logger } from "../config/logger";
import { WhatsappMessage } from "../models/WhatsappMessage.model";
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
  sendWhatsAppContacts,
  sendWhatsAppCtaUrl,
  sendWhatsAppLocation,
  sendWhatsAppMedia,
  sendWhatsAppMenu,
  sendWhatsAppReaction,
  sendWhatsAppTemplate,
  uploadWhatsAppMedia,
} from "./whatsapp.service";
import { ensureConversation, recordOutbound } from "./whatsappChat.service";
import { storeSentCopy, uploadToCloudinary } from "./whatsappMedia.service";
import { deliverSaved } from "./whatsappQuickReply.service";
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
const PLACEHOLDER = { image: "[Photo]", video: "[Video]", document: "[Document]", audio: "[Audio]" } as const;

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export async function sendMediaToChat(
  userId: string,
  id: string,
  file: UploadedFile,
  rawCaption: string,
  options: { saveCopy?: boolean } = {},
): Promise<void> {
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
    media: {
      kind: checked.kind,
      id: mediaId,
      mimeType: file.mimetype,
      filename: file.originalname,
      caption: caption || undefined,
    },
  });
  await markHandled(conversation);

  // The message is already sent; a Cloudinary hiccup must not make it look failed.
  if (options.saveCopy && isCloudinaryConfigured()) {
    try {
      await storeSentCopy(
        waMessageId,
        await uploadToCloudinary({ source: file.buffer, kind: checked.kind, mimeType: file.mimetype, filename: file.originalname }),
      );
    } catch (err) {
      logger.warn({ err }, "Could not keep a Cloudinary copy of a sent file");
    }
  }
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

// ---------------------------------------------------------------------------
// List, link button, location, contact card, reaction
// ---------------------------------------------------------------------------

export interface ListInput {
  header?: string;
  body: string;
  button: string;
  sectionTitle: string;
  rows: { title: string; description?: string }[];
}

/** A tap-to-choose list (up to 10 options). The customer's pick comes back as a message. */
export async function sendListToChat(userId: string, id: string, input: ListInput): Promise<void> {
  const conversation = await loadConversation(id);
  requireWindow(conversation, "a list");

  const rows = input.rows.map((r, i) => ({ id: `staff_row_${i + 1}`, title: r.title.trim(), description: r.description?.trim() || undefined }));
  const waMessageId = await sendWhatsAppMenu(conversation.waId, {
    header: input.header?.trim() || undefined,
    body: input.body.trim(),
    button: input.button.trim(),
    sectionTitle: input.sectionTitle.trim(),
    rows,
  });
  await recordOutbound({
    waId: conversation.waId,
    waMessageId,
    text: `${input.body.trim()}\n[List: ${rows.map((r) => r.title).join(" | ")}]`,
    source: "app",
    sentBy: userId,
    type: "interactive",
  });
  await markHandled(conversation);
}

export interface CtaInput {
  header?: string;
  body: string;
  footer?: string;
  buttonText: string;
  url: string;
}

export async function sendCtaToChat(userId: string, id: string, input: CtaInput): Promise<void> {
  const conversation = await loadConversation(id);
  requireWindow(conversation, "a link button");

  const waMessageId = await sendWhatsAppCtaUrl(conversation.waId, {
    header: input.header?.trim() || undefined,
    body: input.body.trim(),
    footer: input.footer?.trim() || undefined,
    buttonText: input.buttonText.trim(),
    url: input.url.trim(),
  });
  await recordOutbound({
    waId: conversation.waId,
    waMessageId,
    text: `${input.body.trim()}\n[Link: ${input.buttonText.trim()}]`,
    source: "app",
    sentBy: userId,
    type: "interactive",
  });
  await markHandled(conversation);
}

export interface LocationInput {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export async function sendLocationToChat(userId: string, id: string, input: LocationInput): Promise<void> {
  const conversation = await loadConversation(id);
  requireWindow(conversation, "a location");

  const waMessageId = await sendWhatsAppLocation(conversation.waId, input);
  await recordOutbound({
    waId: conversation.waId,
    waMessageId,
    text: `[Location]${input.name ? ` ${input.name}` : ""}`,
    source: "app",
    sentBy: userId,
    type: "location",
    location: input,
  });
  await markHandled(conversation);
}

export interface ContactInput {
  name: string;
  phone: string;
  role?: string;
  email?: string;
}

/** A "save contact" card, e.g. the person who handles the customer's orders. */
export async function sendContactToChat(userId: string, id: string, input: ContactInput): Promise<void> {
  const conversation = await loadConversation(id);
  requireWindow(conversation, "a contact card");

  const waMessageId = await sendWhatsAppContacts(
    conversation.waId,
    [{ name: input.name.trim(), phone: input.phone, role: input.role?.trim() || undefined, email: input.email?.trim() || undefined }],
    company.legalName,
  );
  await recordOutbound({
    waId: conversation.waId,
    waMessageId,
    text: `[Contact card: ${input.name.trim()}]`,
    source: "app",
    sentBy: userId,
    type: "contacts",
  });
  await markHandled(conversation);
}

/** React to one of the customer's messages. An empty emoji takes the reaction back. */
export async function reactToMessage(messageId: string, emoji: string): Promise<void> {
  const message = await WhatsappMessage.findById(messageId).select("conversation waMessageId direction").lean();
  if (!message) throw ApiError.notFound("Message not found");
  if (message.direction !== "in" || !message.waMessageId) throw ApiError.badRequest("You can only react to a customer's message");

  const conversation = await loadConversation(String(message.conversation));
  requireWindow(conversation, "a reaction");

  await sendWhatsAppReaction(conversation.waId, message.waMessageId, emoji);
  await WhatsappMessage.updateOne(
    { _id: messageId },
    emoji ? { $set: { staffReaction: emoji } } : { $unset: { staffReaction: "" } },
  );
}

/** Sends a saved message from the library into a chat (inside the 24-hour window). */
export async function sendSavedToChat(userId: string, id: string, savedId: string): Promise<void> {
  const conversation = await loadConversation(id);
  requireWindow(conversation, "a saved message");
  await deliverSaved(conversation.waId, savedId, { source: "app", sentBy: userId });
  await markHandled(conversation);
}
