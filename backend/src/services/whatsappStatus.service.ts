import { WhatsappEvent } from "../models/WhatsappEvent.model";
import { WhatsappMessage } from "../models/WhatsappMessage.model";
import { listSubscribedApps } from "../utils/metaGraph";
import { graph } from "./metaGraph.service";
import { getWhatsappConfig } from "./whatsappConfig.service";
import { isWhatsappEnabled } from "./whatsappSettings.service";

/**
 * One read of "is the WhatsApp connection healthy?": the number's state and
 * quality, the business account's review and health, the access token's
 * validity, whether webhooks are subscribed and when one last arrived. Every
 * part is fetched on its own, so one failing call never hides the others.
 */

export interface ApiStatus {
  checkedAt: Date;
  service: { enabled: boolean; apiVersion: string; configured: boolean };
  latencyMs: number | null;
  phone: {
    displayPhoneNumber: string;
    verifiedName: string;
    status: string;
    quality: string;
    nameStatus: string;
    pendingName: string;
    pendingNameStatus: string;
    platform: string;
    throughput: string;
    messagingLimit: string;
    accountMode: string;
    codeVerification: string;
    officialBusiness: boolean;
  } | null;
  account: {
    name: string;
    currency: string;
    reviewStatus: string;
    verification: string;
    canSendMessage: string;
    entities: { type: string; canSend: string }[];
  } | null;
  token: { valid: boolean; type: string; neverExpires: boolean; expiresAt: Date | null; scopes: string[]; appName: string; appId: string } | null;
  webhook: { subscribed: boolean | null; subscribedApps: string[]; lastEventAt: Date | null; lastCustomerMessageAt: Date | null };
  /** Each failed call, in words, so the page can say what is wrong. */
  problems: string[];
}

const message = (err: unknown) => (err instanceof Error ? err.message : "Something went wrong");

export async function getApiStatus(): Promise<ApiStatus> {
  const config = await getWhatsappConfig();
  const problems: string[] = [];

  const status: ApiStatus = {
    checkedAt: new Date(),
    service: {
      enabled: await isWhatsappEnabled(),
      apiVersion: /\/(v\d+\.\d+)$/.exec(config.apiUrl)?.[1] ?? "",
      configured: !!(config.phoneNumberId && config.accessToken),
    },
    latencyMs: null,
    phone: null,
    account: null,
    token: null,
    webhook: { subscribed: null, subscribedApps: [], lastEventAt: null, lastCustomerMessageAt: null },
    problems,
  };

  const [lastEvent, lastCustomer] = await Promise.all([
    WhatsappEvent.findOne().sort({ _id: -1 }).select("createdAt").lean(),
    WhatsappMessage.findOne({ direction: "in" }).sort({ timestamp: -1 }).select("timestamp").lean(),
  ]);
  status.webhook.lastEventAt = (lastEvent as { createdAt?: Date } | null)?.createdAt ?? null;
  status.webhook.lastCustomerMessageAt = lastCustomer?.timestamp ?? null;

  if (!status.service.configured) {
    problems.push("The phone number ID or access token is missing. Add them under WhatsApp > Settings.");
    return status;
  }

  const phoneCall = (async () => {
    const started = Date.now();
    try {
      const p = await graph<Record<string, unknown>>("GET", config.phoneNumberId!, {
        config,
        params: {
          fields:
            "display_phone_number,verified_name,quality_rating,code_verification_status,name_status,new_display_name,new_name_status,status,platform_type,throughput,messaging_limit_tier,account_mode,is_official_business_account",
        },
      });
      status.latencyMs = Date.now() - started;
      const str = (v: unknown) => (typeof v === "string" ? v : "");
      const pendingStatus = str(p.new_name_status) === "NONE" ? "" : str(p.new_name_status);
      status.phone = {
        displayPhoneNumber: str(p.display_phone_number),
        verifiedName: str(p.verified_name),
        status: str(p.status),
        quality: str(p.quality_rating),
        nameStatus: str(p.name_status),
        pendingName: pendingStatus ? str(p.new_display_name) : "",
        pendingNameStatus: pendingStatus,
        platform: str(p.platform_type),
        throughput: str((p.throughput as { level?: unknown } | undefined)?.level),
        messagingLimit: str(p.messaging_limit_tier),
        accountMode: str(p.account_mode),
        codeVerification: str(p.code_verification_status),
        officialBusiness: p.is_official_business_account === true,
      };
      if (status.phone.status && status.phone.status !== "CONNECTED") problems.push(`The number's status is ${status.phone.status.toLowerCase()}.`);
      if (status.phone.quality === "RED") problems.push("The number's quality rating is red. Messaging may be limited.");
    } catch (err) {
      problems.push(`Phone number: ${message(err)}`);
    }
  })();

  const accountCall = (async () => {
    if (!config.businessAccountId) {
      problems.push("No Business Account ID is set, so account health can't be checked.");
      return;
    }
    try {
      const a = await graph<{
        name?: string;
        currency?: string;
        account_review_status?: string;
        business_verification_status?: string;
        health_status?: { can_send_message?: string; entities?: { entity_type?: string; can_send_message?: string }[] };
      }>("GET", config.businessAccountId, {
        config,
        params: { fields: "name,currency,account_review_status,business_verification_status,health_status" },
      });
      status.account = {
        name: (a.name ?? "").trim(),
        currency: a.currency ?? "",
        reviewStatus: a.account_review_status ?? "",
        verification: a.business_verification_status ?? "",
        canSendMessage: a.health_status?.can_send_message ?? "",
        entities: (a.health_status?.entities ?? []).map((e) => ({ type: e.entity_type ?? "", canSend: e.can_send_message ?? "" })),
      };
      if (status.account.canSendMessage && status.account.canSendMessage !== "AVAILABLE") {
        problems.push(`WhatsApp reports that sending is ${status.account.canSendMessage.toLowerCase()}.`);
      }
    } catch (err) {
      problems.push(`Business account: ${message(err)}`);
    }
  })();

  const tokenCall = (async () => {
    try {
      const t = await graph<{
        data?: { is_valid?: boolean; type?: string; expires_at?: number; scopes?: string[]; application?: string; app_id?: string };
      }>("GET", "debug_token", { config, params: { input_token: config.accessToken } });
      const d = t.data ?? {};
      status.token = {
        valid: d.is_valid !== false,
        type: d.type ?? "",
        neverExpires: !d.expires_at,
        expiresAt: d.expires_at ? new Date(d.expires_at * 1000) : null,
        scopes: d.scopes ?? [],
        appName: d.application ?? "",
        appId: d.app_id ?? "",
      };
      if (!status.token.valid) problems.push("The access token is no longer valid. Create a new one and save it in Settings.");
      else if (status.token.expiresAt && status.token.expiresAt.getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000) {
        problems.push("The access token expires within 3 days. Use a permanent System User token.");
      }
    } catch (err) {
      problems.push(`Access token: ${message(err)}`);
    }
  })();

  const webhookCall = (async () => {
    if (!config.businessAccountId) return;
    try {
      const apps = listSubscribedApps(await graph("GET", `${config.businessAccountId}/subscribed_apps`, { config }));
      status.webhook.subscribedApps = apps.map((a) => a.name || a.id);
      // Resolved after the token call below, which tells us which app is ours.
      status.webhook.subscribed = apps.length > 0;
      (status.webhook as { _ids?: string[] })._ids = apps.map((a) => a.id);
    } catch (err) {
      problems.push(`Webhook subscription: ${message(err)}`);
    }
  })();

  await Promise.all([phoneCall, accountCall, tokenCall, webhookCall]);

  // Is it OUR app that is subscribed? (Another app being subscribed doesn't help.)
  const ids = (status.webhook as { _ids?: string[] })._ids;
  delete (status.webhook as { _ids?: string[] })._ids;
  const ourApp = status.token?.appId || config.appId;
  if (ids && ourApp) {
    status.webhook.subscribed = ids.includes(ourApp);
    if (!status.webhook.subscribed) problems.push("This app is not subscribed to the account's webhooks, so customer messages won't arrive.");
  }

  return status;
}
