import { query } from "../db.js";

/**
 * Per-user timezone helper. Every date-boundary computation on the server
 * used to hard-code EST via lib/estDate.ts — this module lets a route
 * resolve the user's own IANA zone (auto-detected on the client and saved
 * to user_settings.settings.timezone) with a fast in-process cache.
 *
 * Falls back to America/New_York (the historical default) if the user
 * hasn't saved a timezone yet — matches pre-existing behavior.
 */

const DEFAULT_TZ = "America/New_York";

// user_id → { tz, expiresAt } — small TTL so a "Timezone changed" setting
// takes effect within a few requests without an explicit invalidation call.
const cache = new Map<string, { tz: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

const iso = /^[A-Za-z_]+\/[A-Za-z_0-9+-]+$/;

/** Validate an IANA-shaped timezone id and reject junk before we cache it. */
export function isValidTz(v: unknown): v is string {
  if (typeof v !== "string" || !iso.test(v)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v }).format(new Date());
    return true;
  } catch { return false; }
}

export async function getUserTz(userId: string): Promise<string> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.tz;

  try {
    const rows = await query<{ tz: string | null }>(
      `SELECT settings->>'timezone' AS tz FROM user_settings WHERE user_id = $1`,
      [userId]
    );
    const raw = rows[0]?.tz;
    const tz = isValidTz(raw) ? raw : DEFAULT_TZ;
    cache.set(userId, { tz, expiresAt: now + CACHE_TTL_MS });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** YYYY-MM-DD for "today" in the user's timezone. */
export async function userToday(userId: string): Promise<string> {
  const tz = await getUserTz(userId);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/** YYYY-MM-DD for N days ago in the user's timezone. */
export async function userDaysAgo(userId: string, n: number): Promise<string> {
  const tz = await getUserTz(userId);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz })
    .format(new Date(Date.now() - n * 86400000));
}

/** Explicit invalidate so PATCH /settings can force the next read to re-fetch. */
export function invalidateUserTz(userId: string): void {
  cache.delete(userId);
}
