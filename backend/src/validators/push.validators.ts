import { z } from "zod";
import { isAllowedPushEndpoint } from "../utils/pushPayload";

const endpoint = z
  .string()
  .trim()
  .max(2048)
  .refine(isAllowedPushEndpoint, "That is not a browser push service address");

const base64Url = z
  .string()
  .min(16)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+=*$/, "Invalid key");

export const subscribePushSchema = z.object({
  endpoint,
  keys: z.object({ p256dh: base64Url, auth: base64Url }),
});

export const unsubscribePushSchema = z.object({
  // Not restricted to the allow-list: removing a row we hold is always safe.
  endpoint: z.string().trim().max(2048),
});
