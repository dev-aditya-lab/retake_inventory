import type { Request } from "express";
import type { IncomingMessage, ServerResponse } from "http";

export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * `verify` hook for express.json(). Webhook signatures are computed over the
 * exact bytes Meta sent, which are gone once the body is parsed — so keep them,
 * but only for webhook routes (no reason to hold every request's body).
 */
export function captureWebhookRawBody(req: IncomingMessage, _res: ServerResponse, buf: Buffer): void {
  const url = (req as Request).originalUrl ?? req.url ?? "";
  if (url.startsWith("/webhooks/")) {
    (req as RawBodyRequest).rawBody = buf;
  }
}
