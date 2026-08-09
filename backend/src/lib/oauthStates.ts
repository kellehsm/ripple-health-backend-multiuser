import { randomBytes } from "crypto";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const states = new Map<string, { user_id: string; expiresAt: number }>();

function sweep() {
  const now = Date.now();
  for (const [k, v] of states) {
    if (v.expiresAt <= now) states.delete(k);
  }
}

export function createOAuthState(user_id: string): string {
  sweep();
  const state = randomBytes(24).toString("base64url");
  states.set(state, { user_id, expiresAt: Date.now() + STATE_TTL_MS });
  return state;
}

export function consumeOAuthState(state: string): string | null {
  const entry = states.get(state);
  if (!entry) return null;
  states.delete(state);
  if (Date.now() > entry.expiresAt) return null;
  return entry.user_id;
}
