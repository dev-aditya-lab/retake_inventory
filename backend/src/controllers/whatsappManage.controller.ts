import type { Request, Response } from "express";
import { subscribeToWebhooks, testConnection } from "../services/whatsappAccount.service";
import { getConfigView, saveConfig } from "../services/whatsappConfig.service";
import {
  sendButtonsToChat,
  sendMediaToChat,
  sendTemplateToChat,
  startChat,
} from "../services/whatsappOutbound.service";
import * as quickReplies from "../services/whatsappQuickReply.service";
import * as templates from "../services/whatsappTemplate.service";
import { ApiError } from "../utils/ApiError";
import { objectIdSchema } from "../validators/common.validators";
import {
  createTemplateSchema,
  quickReplySchema,
  saveConfigSchema,
  sendButtonsSchema,
  sendMediaBodySchema,
  sendTemplateSchema,
  startChatSchema,
  templateNameParamSchema,
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
  const { caption } = sendMediaBodySchema.parse(req.body ?? {});
  await sendMediaToChat(userId(req), id, file, caption);
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
