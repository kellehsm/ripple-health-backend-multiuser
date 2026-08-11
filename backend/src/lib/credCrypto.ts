import crypto from "crypto";

/**
 * At-rest encryption for third-party credentials stored in user_settings
 * (Dexcom Share password, Hardcover API token).
 *
 * Values are AES-256-GCM encrypted with CRED_ENCRYPTION_KEY (64 hex chars =
 * 32 bytes) and stored as "enc:v1:<iv>:<tag>:<ciphertext>" (base64 parts).
 * Plaintext legacy values pass through decryptCredential unchanged, so
 * deploys are safe before the boot-time sweep re-encrypts them.
 */

const PREFIX = "enc:v1:";

function getKey(): Buffer | null {
  const hex = process.env.CRED_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, "hex");
}

export function isEncrypted(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

export function encryptCredential(plain: string): string {
  const key = getKey();
  if (!key || !plain || isEncrypted(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptCredential(value: string): string {
  if (!isEncrypted(value)) return value;
  const key = getKey();
  if (!key) throw new Error("Encrypted credential found but CRED_ENCRYPTION_KEY is not set");
  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
