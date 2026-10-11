import type { Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { RawBodyRequest } from "../middleware/rawBody";
import { answerInbound, ingestWebhook } from "../services/whatsappInbound.service";
import { safeEqual, verifyWebhookSignature } from "../utils/whatsappWebhook";

/**
 * GET /webhooks/whatsapp — Meta's one-time handshake when the callback URL is
 * saved in the app dashboard. We must echo `hub.challenge` if the verify token
 * matches the one we configured.
 */
export function verifyWebhook(req: Request, res: Response): void {
  const expected = env.WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    logger.error("WhatsApp webhook verification attempted but WHATSAPP_VERIFY_TOKEN is not set");
    res.sendStatus(403);
    return;
  }

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && typeof token === "string" && typeof challenge === "string" && safeEqual(token, expected)) {
    // text/plain so the echoed value is never interpreted as markup.
    res.status(200).type("text/plain").send(challenge);
    return;
  }

  logger.warn("WhatsApp webhook verification failed: wrong mode or verify token");
  res.sendStatus(403);
}

/**
 * POST /webhooks/whatsapp — inbound messages, delivery receipts and account
 * events. Everything is stored BEFORE Meta is answered: a 5xx makes Meta
 * redeliver (the writes are idempotent), whereas answering first would lose a
 * customer's message if the database hiccuped. Only the automatic replies,
 * which are slower, run after the response.
 */
export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // Never fall back to accepting unsigned requests: that would let anyone
    // trigger messages from our number.
    logger.error("WhatsApp webhook received but WHATSAPP_APP_SECRET is not set; rejecting");
    res.sendStatus(403);
    return;
  }

  const signature = req.get("x-hub-signature-256");
  if (!verifyWebhookSignature((req as RawBodyRequest).rawBody, signature, secret)) {
    logger.warn("WhatsApp webhook rejected: invalid signature");
    res.sendStatus(401);
    return;
  }

  let fresh;
  try {
    fresh = await ingestWebhook(req.body);
  } catch (err) {
    logger.error({ err }, "WhatsApp webhook could not be stored; asking Meta to redeliver");
    res.sendStatus(500);
    return;
  }

  res.sendStatus(200);
  answerInbound(fresh).catch((err) => {
    logger.error({ err }, "WhatsApp auto-reply processing failed");
  });
}
