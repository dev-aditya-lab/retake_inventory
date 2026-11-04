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
whatsappChatRouter.post("/chats/:id/messages", whatsappSendLimiter, chatController.sendChatMessage);
whatsappChatRouter.post("/chats/:id/template", whatsappSendLimiter, manage.sendTemplate);
whatsappChatRouter.post("/chats/:id/media", whatsappSendLimiter, uploadChatMedia, manage.sendMedia);
whatsappChatRouter.post("/chats/:id/buttons", whatsappSendLimiter, manage.sendButtons);

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
whatsappChatRouter.get("/config", adminOnly, manage.getConfig);
whatsappChatRouter.put("/config", adminOnly, manage.updateConfig);
whatsappChatRouter.post("/config/test", adminOnly, manage.checkConnection);
whatsappChatRouter.post("/config/subscribe", adminOnly, manage.subscribeWebhooks);
whatsappChatRouter.get("/health", adminOnly, chatController.health);
whatsappChatRouter.post("/alerts/:id/acknowledge", adminOnly, chatController.acknowledgeAlert);
