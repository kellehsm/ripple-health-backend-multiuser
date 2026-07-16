import { randomUUID } from "crypto";

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const tokens = new Map<string, { user_id: string; expiresAt: number }>();

export function createDownloadToken(user_id: string): string {
  const token = randomUUID();
  tokens.set(token, { user_id, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

// Single-use: removes the token on first successful redemption.
export function redeemDownloadToken(token: string): string | null {
  const entry = tokens.get(token);
  if (!entry) return null;
  tokens.delete(token);
  if (Date.now() > entry.expiresAt) return null;
  return entry.user_id;
}
