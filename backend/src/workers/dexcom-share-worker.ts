/**
 * Headless Dexcom Share sync worker.
 *
 * Runs every 5 minutes, fetches the 3 most recent CGM readings from the
 * Dexcom Share API, and upserts them into glucose_readings.
 *
 * Session caching: a fresh login is only performed when the cached session
 * has expired (4-hour TTL) or Dexcom rejects the session mid-run.
 *
 * Required env vars (in .env or shell):
 *   DATABASE_URL
 *   DEFAULT_USER_ID
 *   DEXCOM_SHARE_ACCOUNT_ID
 *   DEXCOM_SHARE_PASSWORD
 *   DEXCOM_SHARE_REGION   "us" (default) | "ous"
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

/** How often to poll.  Keep at 5 min to match CGM reading cadence. */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How long to trust a cached session before proactively re-authenticating.
 * Dexcom sessions last ~6 h in practice; 4 h gives comfortable headroom.
 */
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

/** Only ask for readings from the last 15 minutes (covers one missed poll). */
const FETCH_WINDOW_MINUTES = 15;

/** Maximum readings to fetch per poll cycle. */
const MAX_READINGS = 3;

// ─── Database ─────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const USER_ID = process.env.DEFAULT_USER_ID;

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

// ─── Session cache ────────────────────────────────────────────────────────────

interface Session {
  sessionId: string;
  baseUrl: string;
  expiresAt: number; // epoch ms
}

let cachedSession: Session | null = null;

function buildBaseUrl(): string {
  const subdomain =
    process.env.DEXCOM_SHARE_REGION === "ous" ? "shareous1" : "share2";
  return `https://${subdomain}.dexcom.com/ShareWebServices/Services`;
}

async function login(): Promise<Session> {
  const accountId = process.env.DEXCOM_SHARE_ACCOUNT_ID;
  const password = process.env.DEXCOM_SHARE_PASSWORD;

  if (!accountId || !password) {
    throw new Error(
      "Missing credentials: set DEXCOM_SHARE_ACCOUNT_ID and DEXCOM_SHARE_PASSWORD in .env"
    );
  }

  const baseUrl = buildBaseUrl();
  log("INFO", "Authenticating with Dexcom Share...");

  const res = await fetch(
    `${baseUrl}/General/LoginPublisherAccountById`,
    {
      method: "POST",
      headers: DEXCOM_HEADERS,
      body: JSON.stringify({
        accountId,
        password,
        applicationId: APPLICATION_ID,
      }),
    }
  );

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
    throw new Error(
      "Dexcom login rejected — verify DEXCOM_SHARE_ACCOUNT_ID, DEXCOM_SHARE_PASSWORD, and DEXCOM_SHARE_REGION"
    );
  }

  log("INFO", "Session acquired", { region: process.env.DEXCOM_SHARE_REGION ?? "us" });
  return { sessionId, baseUrl, expiresAt: Date.now() + SESSION_TTL_MS };
}

/** Returns a valid session, logging in only when necessary. */
async function getSession(): Promise<Session> {
  if (cachedSession && Date.now() < cachedSession.expiresAt) {
    return cachedSession;
  }
  cachedSession = await login();
  return cachedSession;
}

function invalidateSession(): void {
  log("WARN", "Invalidating cached session");
  cachedSession = null;
}

// ─── Dexcom Share API ─────────────────────────────────────────────────────────

interface RawReading {
  WT: string;   // "Date(1691455258000)" — no leading slash
  Value: number;
  Trend: string;
}

/** Thrown when Dexcom signals the current session ID is no longer valid. */
class SessionExpiredError extends Error {}

function parseDexcomDate(wt: string | undefined): Date | null {
  if (!wt) return null;
  // Format: Date(epochMs) — the regex intentionally has no leading slash
  const m = /Date\((\d+)/.exec(wt);
  if (!m) return null;
  return new Date(Number(m[1]));
}

async function fetchReadings(session: Session): Promise<RawReading[]> {
  const url =
    `${session.baseUrl}/Publisher/ReadPublisherLatestGlucoseValues` +
    `?sessionId=${session.sessionId}` +
    `&minutes=${FETCH_WINDOW_MINUTES}` +
    `&maxCount=${MAX_READINGS}`;

  const res = await fetch(url, { method: "POST", headers: DEXCOM_HEADERS });
  const text = await res.text();

  // Dexcom returns HTTP 500 with a message like "SessionNotValid" when the
  // session has been revoked server-side before our TTL expires.
  if (res.status === 500 && /SessionNotValid|SessionIdNotFound/i.test(text)) {
    throw new SessionExpiredError(`Dexcom rejected session: "${text}"`);
  }

  if (!res.ok) {
    throw new Error(`Dexcom readings HTTP ${res.status}: "${text}"`);
  }

  if (!text.trim()) {
    return [];
  }

  return JSON.parse(text) as RawReading[];
}

// ─── Database write ───────────────────────────────────────────────────────────

async function insertReadings(readings: RawReading[]): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const r of readings) {
    const recordedAt = parseDexcomDate(r.WT);

    if (!recordedAt) {
      log("WARN", `Skipping reading with unparseable WT timestamp`, { wt: r.WT });
      skipped++;
      continue;
    }

    const result = await pool.query(
      `INSERT INTO glucose_readings (user_id, recorded_at, mg_dl, trend, source)
       VALUES ($1, $2, $3, $4, 'dexcom_share')
       ON CONFLICT (user_id, recorded_at) DO NOTHING`,
      [USER_ID, recordedAt.toISOString(), r.Value, r.Trend]
    );

    inserted += result.rowCount ?? 0;
    if ((result.rowCount ?? 0) === 0) skipped++;
  }

  return { inserted, skipped };
}

// ─── Sync cycle ───────────────────────────────────────────────────────────────

async function syncOnce(): Promise<void> {
  if (!USER_ID) {
    log("ERROR", "DEFAULT_USER_ID is not set — skipping sync");
    return;
  }

  let session: Session;
  let readings: RawReading[];

  // Fetch — with one automatic re-auth on session expiry
  try {
    session = await getSession();
    readings = await fetchReadings(session);
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      log("WARN", "Session expired mid-run, re-authenticating once...");
      invalidateSession();
      try {
        session = await getSession();
        readings = await fetchReadings(session);
      } catch (retryErr: unknown) {
        log("ERROR", "Sync failed after re-auth", {
          error: (retryErr as Error)?.message,
        });
        return;
      }
    } else {
      log("ERROR", "Sync failed (auth/fetch)", {
        error: (err as Error)?.message,
      });
      return;
    }
  }

  if (!readings.length) {
    log("INFO", "No readings returned for this window");
    return;
  }

  // Write to DB
  try {
    const { inserted, skipped } = await insertReadings(readings);
    log("INFO", "Sync complete", {
      fetched: readings.length,
      inserted,
      skipped,
    });
  } catch (err: unknown) {
    log("ERROR", "DB insert failed", { error: (err as Error)?.message });
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

log("INFO", `Worker starting — polling every ${SYNC_INTERVAL_MS / 1000}s`);

// Fire immediately so we don't wait 5 minutes on first start
void syncOnce();

const timer = setInterval(() => void syncOnce(), SYNC_INTERVAL_MS);

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
