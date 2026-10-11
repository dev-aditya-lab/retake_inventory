import { env } from "../config/env";
import { logger } from "../config/logger";
import { PushSubscription } from "../models/PushSubscription.model";
import { User, type UserRole } from "../models/User.model";
import type { PushPayload } from "../utils/pushPayload";

/**
 * Web Push to staff devices. `web-push` is loaded on first use, so a server
 * without the package (or without VAPID keys) simply runs with push switched
 * off rather than failing to start.
 */

type WebPush = typeof import("web-push").default;

let loaded: Promise<WebPush | null> | undefined;

function load(): Promise<WebPush | null> {
  loaded ??= (async () => {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
      logger.info("Push notifications are off: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are not all set");
      return null;
    }
    try {
      const mod = await import("web-push");
      const webpush = mod.default ?? (mod as unknown as WebPush);
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      return webpush;
    } catch (err) {
      logger.warn({ err }, "Push notifications are off: the web-push package could not be loaded (run `npm install web-push` in /backend)");
      return null;
    }
  })();
  return loaded;
}

export async function isPushEnabled(): Promise<boolean> {
  return (await load()) !== null;
}

export function getPublicKey(): string | undefined {
  return env.VAPID_PUBLIC_KEY;
}

export interface Recipients {
  userIds?: string[];
  roles?: UserRole[];
}

/**
 * Sends `payload` to every device of the matching active users. Never throws:
 * a notification is a courtesy, and failing to send one must not break the
 * request that triggered it. Devices whose subscription has expired are removed.
 */
export async function notify(recipients: Recipients, payload: PushPayload): Promise<void> {
  try {
    const webpush = await load();
    if (!webpush) return;

    const users = await User.find({
      isActive: true,
      ...(recipients.roles ? { role: { $in: recipients.roles } } : {}),
      ...(recipients.userIds ? { _id: { $in: recipients.userIds } } : {}),
    })
      .select("_id")
      .lean();
    if (users.length === 0) return;

    const subscriptions = await PushSubscription.find({ user: { $in: users.map((u) => u._id) } }).lean();
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        const { p256dh, auth } = subscription.keys ?? {};
        if (!p256dh || !auth) return; // a malformed row can't be sent to

        try {
          await webpush.sendNotification(
            { endpoint: subscription.endpoint, keys: { p256dh, auth } },
            body,
            { TTL: 60 * 60, urgency: "high" },
          );
          await PushSubscription.updateOne({ _id: subscription._id }, { $set: { lastSuccessAt: new Date() } });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // The device unsubscribed or the app was removed: stop sending to it.
            await PushSubscription.deleteOne({ _id: subscription._id });
          } else {
            logger.warn({ err, status }, "Push notification could not be delivered");
          }
        }
      }),
    );
  } catch (err) {
    logger.error({ err }, "Push notification failed");
  }
}
