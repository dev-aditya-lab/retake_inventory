import type { Request, Response } from "express";
import { logger } from "../config/logger";
import type { RawBodyRequest } from "../middleware/rawBody";
import { answerInbound, ingestWebhook } from "../services/whatsappInbound.service";
import { getWhatsappConfig } from "../services/whatsappConfig.service";
import { isWhatsappEnabled } from "../services/whatsappSettings.service";
import { safeEqual, verifyWebhookSignature } from "../utils/whatsappWebhook";

/**
 * GET /webhooks/whatsapp — Meta's one-time handshake when the callback URL is
 * saved in the app dashboard. We must echo `hub.challenge` if the verify token
 * matches the one we configured.
 */
export async function verifyWebhook(req: Request, res: Response): Promise<void> {
  const expected = (await getWhatsappConfig()).verifyToken;
  if (!expected) {
    logger.error("WhatsApp webhook verification attempted but no verify token is configured");
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
  const secret = (await getWhatsappConfig()).appSecret;
  if (!secret) {
    // Never fall back to accepting unsigned requests: that would let anyone
    // trigger messages from our number.
    logger.error("WhatsApp webhook received but no app secret is configured; rejecting");
    res.sendStatus(403);
    return;
  }

  const signature = req.get("x-hub-signature-256");
  if (!verifyWebhookSignature((req as RawBodyRequest).rawBody, signature, secret)) {
    logger.warn("WhatsApp webhook rejected: invalid signature");
    res.sendStatus(401);
    return;
  }

  // Switched off by an admin: tell Meta "received" (so it doesn't keep retrying) and do nothing.
  try {
    if (!(await isWhatsappEnabled())) {
      res.sendStatus(200);
      return;
    }
  } catch (err) {
    logger.error({ err }, "Could not read the WhatsApp on/off switch; asking Meta to redeliver");
    res.sendStatus(500);
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
