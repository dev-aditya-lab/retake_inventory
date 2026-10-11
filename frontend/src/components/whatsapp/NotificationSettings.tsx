"use client";

import { useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { usePushNotifications, type PushState } from "@/lib/usePushNotifications";

const EXPLANATION: Record<Exclude<PushState, "loading" | "off" | "on">, string> = {
  unconfigured: "Notifications aren't set up on the server yet. Ask the admin to finish the setup.",
  "needs-install":
    "On iPhone and iPad, notifications work from the Home Screen app. Tap the Share button, choose Add to Home Screen, then open Retake from there and come back to this page.",
  unsupported:
    "This browser can't show notifications here. Use the installed Retake app or an up-to-date Chrome, Edge, Firefox or Safari.",
  blocked:
    "Notifications are blocked for this site. Allow them in your browser or phone settings (Site settings > Notifications), then reload this page.",
};

/** Turn phone / desktop notifications on or off for this device. */
export function NotificationSettings() {
  const { state, busy, error, enable, disable, sendTest } = usePushNotifications();

  return (
    <section aria-labelledby="notifications-heading" className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-muted" aria-hidden>
          {state === "on" ? <BellRing size={20} /> : state === "off" || state === "loading" ? <Bell size={20} /> : <BellOff size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="notifications-heading" className="text-base font-semibold text-foreground">
            Notifications
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Get a notification on this device when a customer needs a reply on WhatsApp.
          </p>

          {state === "loading" && <p className="mt-3 text-sm text-muted">Checking…</p>}

          {state !== "loading" && state !== "off" && state !== "on" && (
            <p className="mt-3 text-sm text-foreground">{EXPLANATION[state]}</p>
          )}

          {state === "off" && (
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="mt-3 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy ? "Turning on…" : "Turn on notifications"}
            </button>
          )}

          {state === "on" && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-sm font-medium text-success sm:mr-2">On for this device</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={busy}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-ink-100 disabled:opacity-60"
                >
                  Send a test
                </button>
                <button
                  type="button"
                  onClick={disable}
                  disabled={busy}
                  className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-ink-100 disabled:opacity-60"
                >
                  Turn off
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** A slim nudge for the WhatsApp section, shown only while this device could be subscribed but isn't. */
export function NotificationPrompt() {
  const { state, busy, enable } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);

  if (state !== "off" || dismissed) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <Bell size={16} className="shrink-0 text-muted" aria-hidden />
      <p className="min-w-0 flex-1 basis-48 text-foreground">Get a notification when a customer needs a reply.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={busy}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Turning on…" : "Turn on"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted hover:bg-ink-100"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
