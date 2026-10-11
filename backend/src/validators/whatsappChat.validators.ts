import { z } from "zod";
import { MAX_TEXT_LENGTH } from "../utils/whatsappChat";
import { paginationQuerySchema } from "./common.validators";

export const listChatsQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  filter: z.enum(["all", "unread", "needs_reply"]).default("all"),
});

export const threadQuerySchema = z.object({
  /** How many of the newest messages to return; ask for more to load earlier history. */
  limit: z.coerce.number().int().min(1).max(300).default(50),
});

export const sendChatMessageSchema = z.object({
  text: z.string().max(MAX_TEXT_LENGTH, `Messages can be at most ${MAX_TEXT_LENGTH} characters`),
});
