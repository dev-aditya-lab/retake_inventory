import type { Request, Response } from "express";
import * as chatService from "../services/whatsappChat.service";
import * as healthService from "../services/whatsappHealth.service";
import { ApiError } from "../utils/ApiError";
import { objectIdSchema } from "../validators/common.validators";
import {
  listChatsQuerySchema,
  sendChatMessageSchema,
  threadQuerySchema,
} from "../validators/whatsappChat.validators";

// Express 5's req.query is getter-only, so query params are parsed inline.

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Not authenticated");
  return req.user.id;
}

export async function summary(req: Request, res: Response): Promise<void> {
  const data = await chatService.getSummary(req.user?.role === "admin");
  res.json({ success: true, data });
}

export async function listChats(req: Request, res: Response): Promise<void> {
  const filters = listChatsQuerySchema.parse(req.query);
  res.json({ success: true, data: await chatService.listConversations(filters) });
}

export async function getChat(req: Request, res: Response): Promise<void> {
  const id = objectIdSchema.parse(req.params.id);
  const { limit } = threadQuerySchema.parse(req.query);
  res.json({ success: true, data: await chatService.getThread(id, limit) });
}

export async function markChatRead(req: Request, res: Response): Promise<void> {
  await chatService.markRead(objectIdSchema.parse(req.params.id));
  res.json({ success: true, data: null });
}

export async function sendChatMessage(req: Request, res: Response): Promise<void> {
  const id = objectIdSchema.parse(req.params.id);
  const { text } = sendChatMessageSchema.parse(req.body);
  await chatService.sendReply(userId(req), id, text);
  res.status(201).json({ success: true, data: null });
}

export async function health(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await healthService.getHealth() });
}

export async function acknowledgeAlert(req: Request, res: Response): Promise<void> {
  await healthService.acknowledgeAlert(objectIdSchema.parse(req.params.id), userId(req));
  res.json({ success: true, data: null });
}
