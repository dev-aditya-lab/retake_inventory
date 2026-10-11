"use client";

import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "@/lib/apiError";
import {
  useGetPushConfigQuery,
  useSendTestPushMutation,
  useSubscribePushMutation,
  useUnsubscribePushMutation,
  type PushSubscriptionBody,
} from "@/lib/redux/features/push/pushApi";

/**
 * Where this device stands with notifications:
 *  loading       - still working it out
 *  unconfigured  - the server has no push keys yet
 *  needs-install - iPhone/iPad: only works from the Home Screen app
 *  unsupported   - this browser (or a dev build with no service worker) can't do it
 *  blocked       - the person said "Block" in the browser's own prompt
 *  off / on      - supported; subscribed or not
 */
export type PushState = "loading" | "unconfigured" | "needs-install" | "unsupported" | "blocked" | "off" | "on";

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac, but a Mac has no touch screen.
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function supportsPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** VAPID public keys travel as base64url; the browser wants the raw bytes. */
function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function toBody(subscription: PushSubscription): PushSubscriptionBody {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  };
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

export function usePushNotifications() {
  const { data: config, isLoading: configLoading } = useGetPushConfigQuery();
  const [subscribeApi] = useSubscribePushMutation();
  const [unsubscribeApi] = useUnsubscribePushMutation();
  const [sendTestApi] = useSendTestPushMutation();

  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledOnServer = config?.enabled === true;

  useEffect(() => {
    if (configLoading) return;
    let cancelled = false;

    async function resolve(): Promise<PushState> {
      if (isIos() && !isStandalone()) return "needs-install";
      if (!supportsPush()) return "unsupported";
      if (!enabledOnServer) return "unconfigured";
      if (Notification.permission === "denied") return "blocked";

      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return "unsupported"; // e.g. `next dev`, which runs without the service worker
      return (await registration.pushManager.getSubscription()) ? "on" : "off";
    }

    resolve()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState("unsupported");
      });

    return () => {
      cancelled = true;
    };
  }, [configLoading, enabledOnServer]);

  const publicKey = config?.publicKey ?? null;

  const enable = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      // Replace any older subscription (e.g. made under previous server keys).
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(publicKey),
      });

      await subscribeApi(toBody(subscription)).unwrap();
      setState("on");
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't turn notifications on. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [publicKey, subscribeApi]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await unsubscribeApi({ endpoint: subscription.endpoint }).unwrap().catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't turn notifications off. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [unsubscribeApi]);

  const sendTest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await sendTestApi().unwrap();
    } catch (err) {
      setError(getApiErrorMessage(err, "Couldn't send the test. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [sendTestApi]);

  return { state, busy, error, enable, disable, sendTest };
}

/**
 * Returns a function that detaches this device from the signed-in user. Call it
 * just before logging out, so a shared phone doesn't keep buzzing with the
 * previous person's customer chats.
 */
export function useReleaseDevice(): () => Promise<void> {
  const [unsubscribeApi] = useUnsubscribePushMutation();

  return useCallback(async () => {
    try {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
      const subscription = await currentSubscription();
      if (!subscription) return;
      await unsubscribeApi({ endpoint: subscription.endpoint }).unwrap().catch(() => undefined);
      await subscription.unsubscribe();
    } catch {
      // Logging out must never be blocked by this.
    }
  }, [unsubscribeApi]);
}
