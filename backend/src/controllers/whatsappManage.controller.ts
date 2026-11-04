import type { Request, Response } from "express";
import { subscribeToWebhooks, testConnection } from "../services/whatsappAccount.service";
import * as crm from "../services/whatsappCrm.service";
import { openMessageMedia, saveMessageMedia } from "../services/whatsappMedia.service";
import { setAutoSaveMedia } from "../services/whatsappSettings.service";
import { getConfigView, saveConfig } from "../services/whatsappConfig.service";
import {
  reactToMessage,
  sendButtonsToChat,
  sendContactToChat,
  sendCtaToChat,
  sendListToChat,
  sendLocationToChat,
  sendMediaToChat,
  sendTemplateToChat,
  startChat,
} from "../services/whatsappOutbound.service";
import * as quickReplies from "../services/whatsappQuickReply.service";
import * as templates from "../services/whatsappTemplate.service";
import { ApiError } from "../utils/ApiError";
import { objectIdSchema } from "../validators/common.validators";
import {
  addNoteSchema,
  createTemplateSchema,
  mediaSettingsSchema,
  quickReplySchema,
  reactionSchema,
  saveConfigSchema,
  sendButtonsSchema,
  sendContactSchema,
  sendCtaSchema,
  sendListSchema,
  sendLocationSchema,
  sendMediaBodySchema,
  sendTemplateSchema,
  startChatSchema,
  templateNameParamSchema,
  updateConversationSchema,
} from "../validators/whatsappChat.validators";

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Not authenticated");
  return req.user.id;
}

// ----- Connection settings (admin) -----

export async function getConfig(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getConfigView() });
}

export async function updateConfig(req: Request, res: Response): Promise<void> {
  await saveConfig(saveConfigSchema.parse(req.body), userId(req));
  res.json({ success: true, data: await getConfigView() });
}

export async function checkConnection(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await testConnection() });
}

export async function subscribeWebhooks(_req: Request, res: Response): Promise<void> {
  await subscribeToWebhooks();
  res.json({ success: true, data: null });
}

// ----- Templates -----

export async function listTemplates(req: Request, res: Response): Promise<void> {
  const sendableOnly = req.query.sendable === "1";
  res.json({ success: true, data: await templates.listTemplates({ sendableOnly }) });
}

export async function syncTemplates(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await templates.syncTemplates() });
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  const created = await templates.createTemplate(createTemplateSchema.parse(req.body));
  res.status(201).json({ success: true, data: created });
}

export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  await templates.deleteTemplate(templateNameParamSchema.parse(req.params.name));
  res.json({ success: true, data: null });
}

// ----- Sending from a chat -----

export async function sendTemplate(req: Request, res: Response): Promise<void> {
  const id = objectIdSchema.parse(req.params.id);
  const { templateId, values } = sendTemplateSchema.parse(req.body);
  await sendTemplateToChat(userId(req), id, templateId, values);
  res.status(201).json({ success: true, data: null });
}

export async function sendMedia(req: Request, res: Response): Promise<void> {
  const id = objectIdSchema.parse(req.params.id);
  const file = req.file;
  if (!file) throw ApiError.badRequest("Choose a photo or document to send");
  const { caption, saveCopy } = sendMediaBodySchema.parse(req.body ?? {});
  await sendMediaToChat(userId(req), id, file, caption, { saveCopy: saveCopy === "true" });
  res.status(201).json({ success: true, data: null });
}

export async function sendButtons(req: Request, res: Response): Promise<void> {
  const id = objectIdSchema.parse(req.params.id);
  await sendButtonsToChat(userId(req), id, sendButtonsSchema.parse(req.body));
  res.status(201).json({ success: true, data: null });
}

export async function startNewChat(req: Request, res: Response): Promise<void> {
  const { phone, name } = startChatSchema.parse(req.body);
  res.status(201).json({ success: true, data: { id: await startChat(phone, name) } });
}

export async function sendList(req: Request, res: Response): Promise<void> {
  await sendListToChat(userId(req), objectIdSchema.parse(req.params.id), sendListSchema.parse(req.body));
  res.status(201).json({ success: true, data: null });
}

export async function sendCta(req: Request, res: Response): Promise<void> {
  await sendCtaToChat(userId(req), objectIdSchema.parse(req.params.id), sendCtaSchema.parse(req.body));
  res.status(201).json({ success: true, data: null });
}

export async function sendLocation(req: Request, res: Response): Promise<void> {
  await sendLocationToChat(userId(req), objectIdSchema.parse(req.params.id), sendLocationSchema.parse(req.body));
  res.status(201).json({ success: true, data: null });
}

export async function sendContact(req: Request, res: Response): Promise<void> {
  await sendContactToChat(userId(req), objectIdSchema.parse(req.params.id), sendContactSchema.parse(req.body));
  res.status(201).json({ success: true, data: null });
}

export async function reactToChatMessage(req: Request, res: Response): Promise<void> {
  await reactToMessage(objectIdSchema.parse(req.params.messageId), reactionSchema.parse(req.body).emoji);
  res.json({ success: true, data: null });
}

// ----- CRM -----

export async function updateChat(req: Request, res: Response): Promise<void> {
  await crm.updateConversation(objectIdSchema.parse(req.params.id), updateConversationSchema.parse(req.body));
  res.json({ success: true, data: null });
}

export async function addChatNote(req: Request, res: Response): Promise<void> {
  await crm.addNote(userId(req), objectIdSchema.parse(req.params.id), addNoteSchema.parse(req.body).text);
  res.status(201).json({ success: true, data: null });
}

export async function listAgents(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await crm.listAgents() });
}

export async function listLabels(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await crm.listLabels() });
}

// ----- Media -----

/** Streams a message's photo / file to the signed-in staff member (from Cloudinary if saved, else Meta). */
export async function viewMedia(req: Request, res: Response): Promise<void> {
  const opened = await openMessageMedia(objectIdSchema.parse(req.params.messageId));
  const download = req.query.download === "1";

  res.setHeader("Content-Type", opened.mimeType || "application/octet-stream");
  if (opened.size) res.setHeader("Content-Length", String(opened.size));
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${opened.filename}"`);
  // Files may be private customer documents: let the browser keep them briefly, but never shared caches.
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");

  opened.stream.on("error", () => res.destroy());
  res.on("close", () => opened.stream.destroy());
  opened.stream.pipe(res);
}

export async function saveMedia(req: Request, res: Response): Promise<void> {
  await saveMessageMedia(objectIdSchema.parse(req.params.messageId));
  res.json({ success: true, data: null });
}

export async function setMediaSettings(req: Request, res: Response): Promise<void> {
  const { autoSave } = mediaSettingsSchema.parse(req.body);
  await setAutoSaveMedia(autoSave, userId(req));
  res.json({ success: true, data: { autoSave } });
}

// ----- Quick replies -----

export async function listQuickReplies(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await quickReplies.listQuickReplies() });
}

export async function createQuickReply(req: Request, res: Response): Promise<void> {
  const created = await quickReplies.createQuickReply(quickReplySchema.parse(req.body), userId(req));
  res.status(201).json({ success: true, data: created });
}

export async function updateQuickReply(req: Request, res: Response): Promise<void> {
  const updated = await quickReplies.updateQuickReply(objectIdSchema.parse(req.params.id), quickReplySchema.parse(req.body));
  res.json({ success: true, data: updated });
}

export async function deleteQuickReply(req: Request, res: Response): Promise<void> {
  await quickReplies.deleteQuickReply(objectIdSchema.parse(req.params.id));
  res.json({ success: true, data: null });
}
