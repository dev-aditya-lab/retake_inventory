import { env } from "../config/env";
import { logger } from "../config/logger";
import { WhatsappSettings } from "../models/WhatsappSettings.model";
import { decryptSecret, encryptSecret, maskSecret } from "../utils/secretBox";
import { withApiVersion } from "../utils/metaGraph";

/**
 * The WhatsApp credentials in effect right now. Values saved from the app (admin
 * settings) win; anything left blank there falls back to the server's
 * environment, so existing deployments keep working untouched.
 */

const KEY = "main";
/** Every send reads the config, so remember it briefly instead of asking MongoDB each time. */
const CACHE_MS = 10_000;

export interface WhatsappConfig {
  phoneNumberId?: string;
  businessAccountId?: string;
  appId?: string;
  /** Base URL including the version, e.g. https://graph.facebook.com/v22.0 */
  apiUrl: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
}

export type ConfigSource = "app" | "env" | "none";

export interface FieldView {
  value: string;
  source: ConfigSource;
}

export interface SecretView {
  set: boolean;
  /** Masked, e.g. "EAAG••••9Zk1". Empty when not set. */
  hint: string;
  source: ConfigSource;
}

export interface ConfigView {
  phoneNumberId: FieldView;
  businessAccountId: FieldView;
  appId: FieldView;
  apiVersion: FieldView;
  accessToken: SecretView;
  verifyToken: SecretView;
  appSecret: SecretView;
  displayPhoneNumber: string;
  verifiedName: string;
  lastCheckedAt: Date | null;
  /** Whether secrets are encrypted with their own key or the JWT-secret fallback. */
  dedicatedEncryptionKey: boolean;
}

export type SecretName = "accessToken" | "verifyToken" | "appSecret";

export interface SaveConfigInput {
  /** undefined = leave as is, "" = clear (fall back to the server environment), otherwise set. */
  phoneNumberId?: string;
  businessAccountId?: string;
  appId?: string;
  apiVersion?: string;
  /** undefined or "" = leave the saved secret alone; use `clear` to remove one. */
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  clear?: SecretName[];
}

function encryptionKey(): string {
  return env.WHATSAPP_SETTINGS_KEY ?? env.JWT_REFRESH_SECRET;
}

type StoredSettings = {
  phoneNumberId?: string | null;
  businessAccountId?: string | null;
  appId?: string | null;
  apiVersion?: string | null;
  accessTokenEnc?: string | null;
  verifyTokenEnc?: string | null;
  appSecretEnc?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  lastCheckedAt?: Date | null;
};

async function loadStored(): Promise<StoredSettings> {
  return (await WhatsappSettings.findOne({ key: KEY }).lean()) ?? {};
}

function open(stored: string | null | undefined, name: string): string | undefined {
  if (!stored) return undefined;
  try {
    return decryptSecret(stored, encryptionKey());
  } catch {
    // Wrong/changed key or damaged value: behave as if nothing was saved so the env fallback still works.
    logger.warn({ name }, "A saved WhatsApp secret could not be decrypted; falling back to the server environment");
    return undefined;
  }
}

let cache: { value: WhatsappConfig; at: number } | undefined;

export function clearWhatsappConfigCache(): void {
  cache = undefined;
}

export async function getWhatsappConfig(): Promise<WhatsappConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const s = await loadStored();
  const value: WhatsappConfig = {
    phoneNumberId: s.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID || undefined,
    businessAccountId: s.businessAccountId || env.WHATSAPP_BUSINESS_ACCOUNT_ID || undefined,
    appId: s.appId || env.WHATSAPP_APP_ID || undefined,
    apiUrl: withApiVersion(env.WHATSAPP_API_URL, s.apiVersion || undefined),
    accessToken: open(s.accessTokenEnc, "accessToken") ?? (env.WHATSAPP_ACCESS_TOKEN || undefined),
    verifyToken: open(s.verifyTokenEnc, "verifyToken") ?? (env.WHATSAPP_VERIFY_TOKEN || undefined),
    appSecret: open(s.appSecretEnc, "appSecret") ?? (env.WHATSAPP_APP_SECRET || undefined),
  };
  cache = { value, at: Date.now() };
  return value;
}

function field(saved: string | null | undefined, fromEnv: string | undefined): FieldView {
  if (saved) return { value: saved, source: "app" };
  if (fromEnv) return { value: fromEnv, source: "env" };
  return { value: "", source: "none" };
}

function secret(savedEnc: string | null | undefined, name: string, fromEnv: string | undefined): SecretView {
  const saved = open(savedEnc, name);
  if (saved) return { set: true, hint: maskSecret(saved), source: "app" };
  if (fromEnv) return { set: true, hint: maskSecret(fromEnv), source: "env" };
  return { set: false, hint: "", source: "none" };
}

/** What the settings screen shows: values for ids, only a masked hint for secrets. */
export async function getConfigView(): Promise<ConfigView> {
  const s = await loadStored();
  const envVersion = /\/(v\d+\.\d+)\/?$/.exec(env.WHATSAPP_API_URL)?.[1];
  return {
    phoneNumberId: field(s.phoneNumberId, env.WHATSAPP_PHONE_NUMBER_ID),
    businessAccountId: field(s.businessAccountId, env.WHATSAPP_BUSINESS_ACCOUNT_ID),
    appId: field(s.appId, env.WHATSAPP_APP_ID),
    apiVersion: field(s.apiVersion, envVersion),
    accessToken: secret(s.accessTokenEnc, "accessToken", env.WHATSAPP_ACCESS_TOKEN),
    verifyToken: secret(s.verifyTokenEnc, "verifyToken", env.WHATSAPP_VERIFY_TOKEN),
    appSecret: secret(s.appSecretEnc, "appSecret", env.WHATSAPP_APP_SECRET),
    displayPhoneNumber: s.displayPhoneNumber ?? "",
    verifiedName: s.verifiedName ?? "",
    lastCheckedAt: s.lastCheckedAt ?? null,
    dedicatedEncryptionKey: !!env.WHATSAPP_SETTINGS_KEY,
  };
}

export async function saveConfig(input: SaveConfigInput, userId: string): Promise<void> {
  const $set: Record<string, unknown> = { updatedBy: userId };
  const $unset: Record<string, ""> = {};

  for (const name of ["phoneNumberId", "businessAccountId", "appId", "apiVersion"] as const) {
    const value = input[name];
    if (value === undefined) continue;
    if (value === "") $unset[name] = "";
    else $set[name] = value;
  }

  const secrets: [SecretName, string][] = [
    ["accessToken", "accessTokenEnc"],
    ["verifyToken", "verifyTokenEnc"],
    ["appSecret", "appSecretEnc"],
  ];
  for (const [name, column] of secrets) {
    const value = input[name];
    if (value) $set[column] = encryptSecret(value, encryptionKey());
    else if (input.clear?.includes(name)) $unset[column] = "";
  }

  // The number / account changed, so what "Test connection" found no longer applies.
  if ("phoneNumberId" in $set || "phoneNumberId" in $unset || "accessTokenEnc" in $set) {
    $unset.displayPhoneNumber = "";
    $unset.verifiedName = "";
    $unset.lastCheckedAt = "";
  }

  await WhatsappSettings.updateOne(
    { key: KEY },
    { $set, ...(Object.keys($unset).length > 0 ? { $unset } : {}) },
    { upsert: true },
  );
  clearWhatsappConfigCache();
}

/** Remembers what "Test connection" learned about the number. */
export async function recordConnectionCheck(info: { displayPhoneNumber?: string; verifiedName?: string }): Promise<void> {
  await WhatsappSettings.updateOne(
    { key: KEY },
    {
      $set: {
        ...(info.displayPhoneNumber ? { displayPhoneNumber: info.displayPhoneNumber } : {}),
        ...(info.verifiedName ? { verifiedName: info.verifiedName } : {}),
        lastCheckedAt: new Date(),
      },
    },
    { upsert: true },
  );
}
