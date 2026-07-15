/**
 * Headless Dexcom Share sync worker — multi-user edition.
 *
 * Runs every 5 minutes, queries all users with Dexcom Share credentials
 * in their user_settings, and fetches the 3 most recent CGM readings for each.
 *
 * Required env vars (in .env or shell):
 *   DATABASE_URL
 *
 * Per-user Dexcom credentials are stored in user_settings.settings.dexcom:
 *   share_account_id, share_password, share_region ("us" | "ous")
 */

import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

// ─── Constants ────────────────────────────────────────────────────────────────

const APPLICATION_ID = "d8665ade-9673-4e27-9ff6-92db4ce13d13";

const DEXCOM_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "Dexcom Share/3.0.2.11 CFNetwork/711.2.23 Darwin/14.0.0",
  Accept: "application/json",
  "Accept-Language": "en-us",
};

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const FETCH_WINDOW_MINUTES = 15;
const MAX_READINGS = 3;

// ─── Database ─────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Logging ──────────────────────────────────────────────────────────────────

type LogLevel = "INFO" | "WARN" | "ERROR";

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  const base = `[${ts}] [dexcom-share-worker] [${level}] ${msg}`;
  if (meta) {
    (level === "ERROR" ? console.error : console.log)(base, meta);
  } else {
    (level === "ERROR" ? console.error : console.log)(base);
  }
}

// ─── Session cache (per user) ─────────────────────────────────────────────────

interface Session {
  sessionId: string;
  baseUrl: string;
  expiresAt: number;
}

const sessionCache = new Map<string, Session>();

function buildBaseUrl(region?: string): string {
  const subdomain = region === "ous" ? "shareous1" : "share2";
  return `https://${subdomain}.dexcom.com/ShareWebServices/Services`;
}

async function login(userId: string, accountId: string, password: string, region?: string): Promise<Session> {
  const baseUrl = buildBaseUrl(region);
  log("INFO", "Authenticating with Dexcom Share", { userId });

  const res = await fetch(`${baseUrl}/General/LoginPublisherAccountById`, {
    method: "POST",
    headers: DEXCOM_HEADERS,
    body: JSON.stringify({ accountId, password, applicationId: APPLICATION_ID }),
  });

  const text = await res.text();
  if (!res.ok || !text.trim()) {
    throw new Error(`Dexcom login HTTP ${res.status}: "${text}"`);
  }

  let sessionId: string;
  try {
    sessionId = JSON.parse(text) as string;
  } catch {
    throw new Error(`Dexcom login returned non-JSON body: "${text}"`);
  }

  if (!sessionId || sessionId === "00000000-0000-0000-0000-000000000000") {
    throw new Error("Dexcom login rejected — verify account ID, password, and region");
  }

  const session: Session = { sessionId, baseUrl, expiresAt: Date.now() + SESSION_TTL_MS };
  sessionCache.set(userId, session);
  log("INFO", "Session acquired", { userId, region: region ?? "us" });
  return session;
}

async function getSession(userId: string, accountId: string, password: string, region?: string): Promise<Session> {
  const cached = sessionCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached;
  return login(userId, accountId, password, region);
}

// ─── Dexcom Share API ─────────────────────────────────────────────────────────

interface RawReading {
  WT: string;
  Value: number;
  Trend: string;
}

class SessionExpiredError extends Error {}

function parseDexcomDate(wt: string | undefined): Date | null {
  if (!wt) return null;
  const m = /Date\((\d+)/.exec(wt);
  if (!m) return null;
  return new Date(Number(m[1]));
}

async function fetchReadings(session: Session): Promise<RawReading[]> {
  const url =
    `${session.baseUrl}/Publisher/ReadPublisherLatestGlucoseValues` +
    `?sessionId=${session.sessionId}&minutes=${FETCH_WINDOW_MINUTES}&maxCount=${MAX_READINGS}`;

  const res = await fetch(url, { method: "POST", headers: DEXCOM_HEADERS });
  const text = await res.text();

  if (res.status === 500 && /SessionNotValid|SessionIdNotFound/i.test(text)) {
    throw new SessionExpiredError(`Dexcom rejected session: "${text}"`);
  }
  if (!res.ok) throw new Error(`Dexcom readings HTTP ${res.status}: "${text}"`);
  if (!text.trim()) return [];
  return JSON.parse(text) as RawReading[];
}

// ─── Database write ───────────────────────────────────────────────────────────

async function insertReadings(userId: string, readings: RawReading[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const r of readings) {
    const recordedAt = parseDexcomDate(r.WT);
    if (!recordedAt) {
      log("WARN", "Skipping reading with unparseable WT timestamp", { userId, wt: r.WT });
      skipped++;
      continue;
    }

    const result = await pool.query(
      `INSERT INTO glucose_readings (user_id, recorded_at, mg_dl, trend, source)
       VALUES ($1, $2, $3, $4, 'dexcom_share')
       ON CONFLICT (user_id, recorded_at) DO NOTHING`,
      [userId, recordedAt.toISOString(), r.Value, r.Trend]
    );

    inserted += result.rowCount ?? 0;
    if ((result.rowCount ?? 0) === 0) skipped++;
  }

  return { inserted, skipped };
}

// ─── Per-user sync ────────────────────────────────────────────────────────────

async function syncUser(userId: string, dexcomSettings: Record<string, any>): Promise<void> {
  const accountId: string = dexcomSettings.share_account_id ?? "";
  const password: string = dexcomSettings.share_password ?? "";
  const region: string | undefined = dexcomSettings.share_region;

  if (!accountId || !password) {
    log("WARN", "Skipping user — missing share_account_id or share_password", { userId });
    return;
  }

  let session: Session;
  let readings: RawReading[];

  try {
    session = await getSession(userId, accountId, password, region);
    readings = await fetchReadings(session);
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      log("WARN", "Session expired mid-run, re-authenticating", { userId });
      sessionCache.delete(userId);
      try {
        session = await getSession(userId, accountId, password, region);
        readings = await fetchReadings(session);
      } catch (retryErr: unknown) {
        log("ERROR", "Sync failed after re-auth", { userId, error: (retryErr as Error)?.message });
        return;
      }
    } else {
      log("ERROR", "Sync failed (auth/fetch)", { userId, error: (err as Error)?.message });
      return;
    }
  }

  if (!readings.length) {
    log("INFO", "No readings for this window", { userId });
    return;
  }

  try {
    const { inserted, skipped } = await insertReadings(userId, readings);
    log("INFO", "Sync complete", { userId, fetched: readings.length, inserted, skipped });
  } catch (err: unknown) {
    log("ERROR", "DB insert failed", { userId, error: (err as Error)?.message });
  }
}

// ─── Sync cycle ───────────────────────────────────────────────────────────────

async function syncAll(): Promise<void> {
  let users: Array<{ user_id: string; settings: Record<string, any> }>;
  try {
    const result = await pool.query<{ user_id: string; settings: Record<string, any> }>(
      `SELECT user_id, settings FROM user_settings
       WHERE settings->'dexcom'->>'share_account_id' IS NOT NULL
         AND settings->'dexcom'->>'share_password' IS NOT NULL`
    );
    users = result.rows;
  } catch (err: unknown) {
    log("ERROR", "Failed to query users with Dexcom credentials", { error: (err as Error)?.message });
    return;
  }

  if (users.length === 0) {
    log("INFO", "No users with Dexcom Share credentials configured");
    return;
  }

  log("INFO", `Syncing ${users.length} user(s)`);
  for (const { user_id, settings } of users) {
    await syncUser(user_id, settings.dexcom ?? {});
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

log("INFO", `Worker starting — polling every ${SYNC_INTERVAL_MS / 1000}s`);

void syncAll();

const timer = setInterval(() => void syncAll(), SYNC_INTERVAL_MS);

function shutdown(signal: string): void {
  log("INFO", `${signal} received — shutting down`);
  clearInterval(timer);
  pool.end(() => {
    log("INFO", "DB pool closed");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
