import type { Request, Response } from "express";
import { subscribeToWebhooks, testConnection } from "../services/whatsappAccount.service";
import * as automations from "../services/whatsappAutomation.service";
import type { AutomationInput } from "../services/whatsappAutomation.service";
import * as broadcasts from "../services/whatsappBroadcast.service";
import * as crm from "../services/whatsappCrm.service";
import * as profile from "../services/whatsappProfile.service";
import { getApiStatus } from "../services/whatsappStatus.service";
import { getAnalytics, getUsage } from "../services/whatsappUsage.service";
import type { ProfileUpdate } from "../utils/whatsappProfile";
import { safeFilename } from "../utils/whatsappMedia";

type SavedBody =
  | { kind: "text"; title: string; text: string }
  | { kind: "buttons" | "list" | "cta" | "location" | "contact" | "media"; title: string; data: Record<string, unknown> };
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
  sendSavedToChat,
  sendTemplateToChat,
  startChat,
} from "../services/whatsappOutbound.service";
import * as quickReplies from "../services/whatsappQuickReply.service";
import * as templates from "../services/whatsappTemplate.service";
import { ApiError } from "../utils/ApiError";
import { objectIdSchema } from "../validators/common.validators";
import {
  addNoteSchema,
  audienceSchema,
  automationEnabledSchema,
  automationSchema,
  businessHoursSchema,
  broadcastDetailQuerySchema,
  createBroadcastSchema,
  createTemplateSchema,
  deleteChatsSchema,
  displayNameSchema,
  mediaSettingsSchema,
  quickReplySchema,
  reactionSchema,
  saveConfigSchema,
  sendButtonsSchema,
  sendContactSchema,
  sendCtaSchema,
  sendListSchema,
  sendLocationSchema,
  savedMediaBodySchema,
  sendMediaBodySchema,
  sendSavedSchema,
  sendTemplateSchema,
  startChatSchema,
  templateNameParamSchema,
  updateConversationSchema,
  updateProfileSchema,
  usageQuerySchema,
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

// ----- Automations -----

export async function listAutomations(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await automations.listAutomations() });
}

export async function createAutomation(req: Request, res: Response): Promise<void> {
  const created = await automations.createAutomation(automationSchema.parse(req.body) as AutomationInput, userId(req));
  res.status(201).json({ success: true, data: created });
}

export async function updateAutomation(req: Request, res: Response): Promise<void> {
  const updated = await automations.updateAutomation(objectIdSchema.parse(req.params.id), automationSchema.parse(req.body) as AutomationInput);
  res.json({ success: true, data: updated });
}

export async function toggleAutomation(req: Request, res: Response): Promise<void> {
  await automations.setAutomationEnabled(objectIdSchema.parse(req.params.id), automationEnabledSchema.parse(req.body).enabled);
  res.json({ success: true, data: null });
}

export async function deleteAutomation(req: Request, res: Response): Promise<void> {
  await automations.deleteAutomation(objectIdSchema.parse(req.params.id));
  res.json({ success: true, data: null });
}

export async function getHours(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await automations.getBusinessHours() });
}

export async function updateHours(req: Request, res: Response): Promise<void> {
  await automations.setBusinessHours(businessHoursSchema.parse(req.body), userId(req));
  res.json({ success: true, data: await automations.getBusinessHours() });
}

// ----- Broadcasts -----

export async function previewBroadcastAudience(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await broadcasts.previewAudience(audienceSchema.parse(req.body)) });
}

export async function createBroadcast(req: Request, res: Response): Promise<void> {
  const id = await broadcasts.createBroadcast(createBroadcastSchema.parse(req.body), userId(req));
  res.status(201).json({ success: true, data: { id } });
}

export async function listBroadcasts(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await broadcasts.listBroadcasts() });
}

export async function getBroadcast(req: Request, res: Response): Promise<void> {
  const query = broadcastDetailQuerySchema.parse(req.query);
  res.json({ success: true, data: await broadcasts.getBroadcast(objectIdSchema.parse(req.params.id), query) });
}

export async function startBroadcast(req: Request, res: Response): Promise<void> {
  await broadcasts.startBroadcast(objectIdSchema.parse(req.params.id));
  res.json({ success: true, data: null });
}

export async function cancelBroadcast(req: Request, res: Response): Promise<void> {
  await broadcasts.cancelBroadcast(objectIdSchema.parse(req.params.id));
  res.json({ success: true, data: null });
}

export async function deleteBroadcast(req: Request, res: Response): Promise<void> {
  await broadcasts.deleteBroadcast(objectIdSchema.parse(req.params.id));
  res.json({ success: true, data: null });
}

// ----- Business profile -----

export async function getBusinessProfile(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await profile.getProfile() });
}

export async function updateBusinessProfile(req: Request, res: Response): Promise<void> {
  await profile.updateProfile(updateProfileSchema.parse(req.body) as ProfileUpdate);
  res.json({ success: true, data: await profile.getProfile() });
}

export async function updateBusinessPicture(req: Request, res: Response): Promise<void> {
  if (!req.file) throw ApiError.badRequest("Choose a picture");
  await profile.updateProfilePicture(req.file);
  res.json({ success: true, data: await profile.getProfile() });
}

export async function requestBusinessName(req: Request, res: Response): Promise<void> {
  await profile.requestDisplayName(displayNameSchema.parse(req.body).name);
  res.json({ success: true, data: await profile.getProfile() });
}

// ----- Status, usage, analytics -----

export async function apiStatus(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getApiStatus() });
}

export async function usage(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getUsage(usageQuerySchema.parse(req.query).range) });
}

export async function analytics(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getAnalytics(usageQuerySchema.parse(req.query).range) });
}

// ----- Deleting chats -----

export async function deleteChat(req: Request, res: Response): Promise<void> {
  const deleteSavedFiles = req.query.deleteFiles === "1";
  res.json({ success: true, data: await crm.deleteChats([objectIdSchema.parse(req.params.id)], deleteSavedFiles) });
}

export async function deleteManyChats(req: Request, res: Response): Promise<void> {
  const { ids, deleteSavedFiles } = deleteChatsSchema.parse(req.body);
  res.json({ success: true, data: await crm.deleteChats(ids, deleteSavedFiles) });
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
  const input = quickReplySchema.parse(req.body) as SavedBody;
  const created = await quickReplies.createQuickReply(
    { title: input.title, kind: input.kind, text: input.kind === "text" ? input.text : undefined, data: input.kind === "text" ? undefined : input.data },
    userId(req),
  );
  res.status(201).json({ success: true, data: created });
}

export async function createSavedMedia(req: Request, res: Response): Promise<void> {
  if (!req.file) throw ApiError.badRequest("Choose a photo or file to save");
  const { title, caption } = savedMediaBodySchema.parse(req.body ?? {});
  res.status(201).json({ success: true, data: await quickReplies.createMediaSaved(req.file, title, caption, userId(req)) });
}

export async function updateQuickReply(req: Request, res: Response): Promise<void> {
  const input = quickReplySchema.parse(req.body) as SavedBody;
  const updated = await quickReplies.updateQuickReply(objectIdSchema.parse(req.params.id), {
    title: input.title,
    ...(input.kind === "text" ? { text: input.text } : { data: input.data }),
  });
  res.json({ success: true, data: updated });
}

/** Streams the file of a saved photo / document so the library can preview it. */
export async function viewSavedFile(req: Request, res: Response): Promise<void> {
  const file = await quickReplies.openSavedFile(objectIdSchema.parse(req.params.id));
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename(file.filename, "file")}"`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  file.stream.on("error", () => res.destroy());
  res.on("close", () => file.stream.destroy());
  file.stream.pipe(res);
}

export async function sendSaved(req: Request, res: Response): Promise<void> {
  await sendSavedToChat(userId(req), objectIdSchema.parse(req.params.id), sendSavedSchema.parse(req.body).savedId);
  res.status(201).json({ success: true, data: null });
}

export async function deleteQuickReply(req: Request, res: Response): Promise<void> {
  await quickReplies.deleteQuickReply(objectIdSchema.parse(req.params.id));
  res.json({ success: true, data: null });
}
