import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Encrypts small secrets (API tokens) before they are stored in the database,
 * so a leaked database dump or backup does not leak the WhatsApp access token.
 *
 * AES-256-GCM: the auth tag makes any tampering fail loudly on decrypt. The
 * stored form is `v1:<iv>:<tag>:<ciphertext>` (base64 parts). Pure functions:
 * the key material is passed in, so this never reads env and is unit-testable.
 */

const VERSION = "v1";
const IV_BYTES = 12;

function deriveKey(keyMaterial: string): Buffer {
  if (!keyMaterial) throw new Error("An encryption key is required");
  // The material is a long random secret, so one SHA-256 pass is a sound KDF here.
  return createHash("sha256").update(`whatsapp-settings:${keyMaterial}`).digest();
}

export function encryptSecret(plain: string, keyMaterial: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(keyMaterial), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** Throws if the value is malformed, was tampered with, or was encrypted with a different key. */
export function decryptSecret(stored: string, keyMaterial: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(keyMaterial), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** "EAAG…x9Zk" style hint so an admin can recognise a saved secret without it being exposed. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
