import { Router } from "express";
import * as chatController from "../controllers/whatsappChat.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { whatsappLimiter, whatsappSendLimiter } from "../middleware/rateLimit";

/**
 * Staff-facing WhatsApp section. Chats are open to every signed-in staff role;
 * the account-health view (templates, number quality, alerts) is admin-only.
 *
 * Mounted ahead of the global /api limiter (see app.ts): the app polls these
 * endpoints every few seconds while a chat is open, which would otherwise eat
 * the shop's shared per-IP budget. They have their own per-user limits.
 */
export const whatsappChatRouter = Router();

whatsappChatRouter.use(authenticate, whatsappLimiter);

whatsappChatRouter.get("/summary", chatController.summary);
whatsappChatRouter.get("/chats", chatController.listChats);
whatsappChatRouter.get("/chats/:id", chatController.getChat);
whatsappChatRouter.post("/chats/:id/read", chatController.markChatRead);
whatsappChatRouter.post("/chats/:id/messages", whatsappSendLimiter, chatController.sendChatMessage);

const adminOnly = requireRole("admin");
whatsappChatRouter.get("/health", adminOnly, chatController.health);
whatsappChatRouter.post("/alerts/:id/acknowledge", adminOnly, chatController.acknowledgeAlert);
