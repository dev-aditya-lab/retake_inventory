import { WhatsappSettings } from "../models/WhatsappSettings.model";

const KEY = "main";
/** Every send checks the switch, so remember the answer briefly instead of asking MongoDB each time. */
const CACHE_MS = 10_000;

let cache: { value: boolean; at: number } | undefined;

export async function isWhatsappEnabled(): Promise<boolean> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const settings = await WhatsappSettings.findOne({ key: KEY }).select("enabled").lean();
  const value = settings?.enabled ?? true;
  cache = { value, at: Date.now() };
  return value;
}

export async function setWhatsappEnabled(enabled: boolean, userId: string): Promise<void> {
  await WhatsappSettings.updateOne({ key: KEY }, { $set: { enabled, updatedBy: userId } }, { upsert: true });
  cache = { value: enabled, at: Date.now() };
}
