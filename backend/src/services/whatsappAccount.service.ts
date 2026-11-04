import { graph } from "./metaGraph.service";
import { getWhatsappConfig, recordConnectionCheck } from "./whatsappConfig.service";
import { ApiError } from "../utils/ApiError";

/**
 * "Is this set up right?" for the admin settings screen: asks Meta about the
 * saved phone number and business account, and can subscribe our app to the
 * account's webhooks (a step that is easy to forget and silently stops incoming
 * messages).
 */

export interface ConnectionCheck {
  key: "credentials" | "phone" | "account" | "webhook";
  label: string;
  ok: boolean;
  detail: string;
}

export interface ConnectionResult {
  ok: boolean;
  checks: ConnectionCheck[];
  phone: { displayPhoneNumber: string; verifiedName: string; quality: string } | null;
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export async function testConnection(): Promise<ConnectionResult> {
  const config = await getWhatsappConfig();
  const checks: ConnectionCheck[] = [];
  let phone: ConnectionResult["phone"] = null;

  const missing = [
    !config.phoneNumberId && "phone number ID",
    !config.accessToken && "access token",
  ].filter(Boolean);
  if (missing.length > 0) {
    checks.push({ key: "credentials", label: "Credentials", ok: false, detail: `Missing: ${missing.join(" and ")}` });
    return { ok: false, checks, phone };
  }
  checks.push({ key: "credentials", label: "Credentials", ok: true, detail: "Phone number ID and access token are set" });

  try {
    const info = await graph<{ display_phone_number?: string; verified_name?: string; quality_rating?: string }>(
      "GET",
      config.phoneNumberId!,
      { config, params: { fields: "display_phone_number,verified_name,quality_rating" } },
    );
    phone = {
      displayPhoneNumber: info.display_phone_number ?? "",
      verifiedName: info.verified_name ?? "",
      quality: (info.quality_rating ?? "").toUpperCase(),
    };
    await recordConnectionCheck({ displayPhoneNumber: phone.displayPhoneNumber, verifiedName: phone.verifiedName });
    checks.push({
      key: "phone",
      label: "Phone number",
      ok: true,
      detail: [phone.displayPhoneNumber, phone.verifiedName].filter(Boolean).join(" · ") || "Connected",
    });
  } catch (err) {
    checks.push({ key: "phone", label: "Phone number", ok: false, detail: reason(err) });
  }

  if (!config.businessAccountId) {
    checks.push({
      key: "account",
      label: "Business account",
      ok: false,
      detail: "No Business Account ID yet. It is needed to list and create templates.",
    });
  } else {
    try {
      const account = await graph<{ name?: string }>("GET", config.businessAccountId, { config, params: { fields: "name" } });
      checks.push({ key: "account", label: "Business account", ok: true, detail: account.name || "Connected" });

      try {
        const subscribed = await graph<{ data?: unknown[] }>("GET", `${config.businessAccountId}/subscribed_apps`, { config });
        const on = (subscribed.data?.length ?? 0) > 0;
        checks.push({
          key: "webhook",
          label: "Incoming messages",
          ok: on,
          detail: on ? "The app is subscribed to this account's webhooks" : "The app is not subscribed yet. Use “Subscribe to messages”.",
        });
      } catch (err) {
        checks.push({ key: "webhook", label: "Incoming messages", ok: false, detail: reason(err) });
      }
    } catch (err) {
      checks.push({ key: "account", label: "Business account", ok: false, detail: reason(err) });
    }
  }

  return { ok: checks.every((c) => c.ok), checks, phone };
}

/** Subscribes the Meta app to the business account's webhooks so customer messages reach us. */
export async function subscribeToWebhooks(): Promise<void> {
  const config = await getWhatsappConfig();
  if (!config.businessAccountId) throw ApiError.badRequest("Add the WhatsApp Business Account ID first");
  await graph("POST", `${config.businessAccountId}/subscribed_apps`, { config });
}
