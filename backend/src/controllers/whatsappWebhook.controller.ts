import type { Request, Response } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { RawBodyRequest } from "../middleware/rawBody";
import { processWhatsAppWebhook } from "../services/whatsappInbound.service";
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
 * POST /webhooks/whatsapp — inbound messages and delivery receipts. Meta wants
 * a fast 200 and retries on anything else, so acknowledge first and do the
 * work afterwards.
 */
export function receiveWebhook(req: Request, res: Response): void {
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

  res.sendStatus(200);
  processWhatsAppWebhook(req.body).catch((err) => {
    logger.error({ err }, "WhatsApp webhook processing failed");
  });
}
