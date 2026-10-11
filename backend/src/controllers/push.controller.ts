import type { Request, Response } from "express";
import { PushSubscription } from "../models/PushSubscription.model";
import * as pushService from "../services/push.service";
import { ApiError } from "../utils/ApiError";
import { testPush } from "../utils/pushPayload";
import { subscribePushSchema, unsubscribePushSchema } from "../validators/push.validators";

/** One person rarely has more than a phone, a tablet and a computer. */
const MAX_DEVICES_PER_USER = 10;

function userId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Not authenticated");
  return req.user.id;
}

/** Tells the app whether push is configured on this server, and the public key a browser needs to subscribe. */
export async function config(_req: Request, res: Response): Promise<void> {
  const enabled = await pushService.isPushEnabled();
  res.json({ success: true, data: { enabled, publicKey: enabled ? pushService.getPublicKey() : null } });
}

export async function subscribe(req: Request, res: Response): Promise<void> {
  const user = userId(req);
  const { endpoint, keys } = subscribePushSchema.parse(req.body);

  // A device belongs to whoever enabled notifications on it last (shared phones).
  await PushSubscription.updateOne(
    { endpoint },
    { $set: { user, keys, userAgent: (req.get("user-agent") ?? "").slice(0, 200) } },
    { upsert: true },
  );

  const extra = await PushSubscription.find({ user }).sort({ updatedAt: -1 }).skip(MAX_DEVICES_PER_USER).select("_id").lean();
  if (extra.length > 0) await PushSubscription.deleteMany({ _id: { $in: extra.map((e) => e._id) } });

  res.status(201).json({ success: true, data: null });
}

export async function unsubscribe(req: Request, res: Response): Promise<void> {
  const { endpoint } = unsubscribePushSchema.parse(req.body);
  await PushSubscription.deleteOne({ endpoint, user: userId(req) });
  res.json({ success: true, data: null });
}

/** "Send me a test": the quickest way to confirm a device is set up. */
export async function test(req: Request, res: Response): Promise<void> {
  if (!(await pushService.isPushEnabled())) {
    throw ApiError.badRequest("Notifications are not set up on the server yet");
  }
  await pushService.notify({ userIds: [userId(req)] }, testPush);
  res.json({ success: true, data: null });
}
