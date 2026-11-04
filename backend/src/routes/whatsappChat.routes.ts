import { Router } from "express";
import * as chatController from "../controllers/whatsappChat.controller";
import * as manage from "../controllers/whatsappManage.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { whatsappLimiter, whatsappSendLimiter } from "../middleware/rateLimit";
import { uploadChatMedia } from "../middleware/upload";

/**
 * Staff-facing WhatsApp section. Chats are open to every signed-in staff role;
 * the account-health view, connection settings and template management are
 * admin-only.
 *
 * Mounted ahead of the global /api limiter (see app.ts): the app polls these
 * endpoints every few seconds while a chat is open, which would otherwise eat
 * the shop's shared per-IP budget. They have their own per-user limits.
 */
export const whatsappChatRouter = Router();

whatsappChatRouter.use(authenticate, whatsappLimiter);

const adminOnly = requireRole("admin");

// ----- Chats (every staff role) -----
whatsappChatRouter.get("/summary", chatController.summary);
whatsappChatRouter.get("/chats", chatController.listChats);
whatsappChatRouter.post("/chats/start", manage.startNewChat);
whatsappChatRouter.get("/chats/:id", chatController.getChat);
whatsappChatRouter.post("/chats/:id/read", chatController.markChatRead);
whatsappChatRouter.patch("/chats/:id", manage.updateChat);
whatsappChatRouter.post("/chats/:id/notes", manage.addChatNote);
whatsappChatRouter.get("/agents", manage.listAgents);
whatsappChatRouter.get("/labels", manage.listLabels);
whatsappChatRouter.post("/chats/:id/messages", whatsappSendLimiter, chatController.sendChatMessage);
whatsappChatRouter.post("/chats/:id/template", whatsappSendLimiter, manage.sendTemplate);
whatsappChatRouter.post("/chats/:id/media", whatsappSendLimiter, uploadChatMedia, manage.sendMedia);
whatsappChatRouter.post("/chats/:id/buttons", whatsappSendLimiter, manage.sendButtons);
whatsappChatRouter.post("/chats/:id/list", whatsappSendLimiter, manage.sendList);
whatsappChatRouter.post("/chats/:id/cta", whatsappSendLimiter, manage.sendCta);
whatsappChatRouter.post("/chats/:id/location", whatsappSendLimiter, manage.sendLocation);
whatsappChatRouter.post("/chats/:id/contact", whatsappSendLimiter, manage.sendContact);
whatsappChatRouter.post("/messages/:messageId/react", whatsappSendLimiter, manage.reactToChatMessage);

// ----- Photos and files in chats (every staff role may view and save) -----
whatsappChatRouter.get("/media/:messageId", manage.viewMedia);
whatsappChatRouter.post("/media/:messageId/save", manage.saveMedia);

// ----- Templates and quick replies: everyone reads, admins manage -----
whatsappChatRouter.get("/templates", manage.listTemplates);
whatsappChatRouter.post("/templates/sync", adminOnly, manage.syncTemplates);
whatsappChatRouter.post("/templates", adminOnly, manage.createTemplate);
whatsappChatRouter.delete("/templates/:name", adminOnly, manage.deleteTemplate);

whatsappChatRouter.get("/quick-replies", manage.listQuickReplies);
whatsappChatRouter.post("/quick-replies", adminOnly, manage.createQuickReply);
whatsappChatRouter.put("/quick-replies/:id", adminOnly, manage.updateQuickReply);
whatsappChatRouter.delete("/quick-replies/:id", adminOnly, manage.deleteQuickReply);

// ----- Service switch, connection settings, account health (admin) -----
whatsappChatRouter.put("/settings", adminOnly, chatController.setServiceEnabled);
whatsappChatRouter.put("/settings/media", adminOnly, manage.setMediaSettings);
whatsappChatRouter.get("/config", adminOnly, manage.getConfig);
whatsappChatRouter.put("/config", adminOnly, manage.updateConfig);
whatsappChatRouter.post("/config/test", adminOnly, manage.checkConnection);
whatsappChatRouter.post("/config/subscribe", adminOnly, manage.subscribeWebhooks);
whatsappChatRouter.get("/health", adminOnly, chatController.health);
whatsappChatRouter.post("/alerts/:id/acknowledge", adminOnly, chatController.acknowledgeAlert);
