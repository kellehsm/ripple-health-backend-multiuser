import { pool, query } from "../db.js";
import type { FastifyBaseLogger } from "fastify";

// Dexcom Share application ID (public, fixed across all Share clients)
const APPLICATION_ID = "d8665ade-9673-4e27-9ff6-92db4ce13d13";

const SHARE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "Dexcom Share/3.0.2.11 CFNetwork/711.2.23 Darwin/14.0.0",
  Accept: "application/json",
  "Accept-Language": "en-us",
};

// Dexcom Share sessions are valid for ~24h. Refresh every 23h to stay ahead.
const SESSION_TTL_MS = 23 * 60 * 60 * 1000;

interface SessionEntry {
  sessionId: string;
  baseUrl: string;
  expiresAt: number;
}

const sessionCache = new Map<string, SessionEntry>();

interface Credentials {
  accountId: string;
  password: string;
  baseUrl: string;
}

async function resolveCredentials(userId: string): Promise<Credentials> {
  // Start with env vars as the baseline; DB settings (from app Settings screen) override them.
  let accountId = process.env.DEXCOM_SHARE_ACCOUNT_ID ?? "";
  let password = process.env.DEXCOM_SHARE_PASSWORD ?? "";
  let region = process.env.DEXCOM_SHARE_REGION === "ous" ? "shareous1" : "share2";

  try {
    const rows = await query<{ settings: Record<string, any> }>(
      "SELECT settings FROM user_settings WHERE user_id = $1",
      [userId]
    );
    const dexcom = rows[0]?.settings?.dexcom;
    if (dexcom?.share_account_id) accountId = dexcom.share_account_id;
    if (dexcom?.share_password) password = dexcom.share_password;
    if (dexcom?.share_region === "ous") region = "shareous1";
    else if (dexcom?.share_region === "us") region = "share2";
  } catch {
    // user_settings may not exist yet — fall through to env vars
  }

  if (!accountId || !password) {
    throw new Error("Dexcom credentials not configured (set via app Settings or DEXCOM_SHARE_ACCOUNT_ID / DEXCOM_SHARE_PASSWORD in .env)");
  }

  return {
    accountId,
    password,
    baseUrl: `https://${region}.dexcom.com/ShareWebServices/Services`,
  };
}

async function authenticate(userId: string): Promise<SessionEntry> {
  const cached = sessionCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const { accountId, password, baseUrl } = await resolveCredentials(userId);

  // Must use LoginPublisherAccountById (account-ID-based), NOT email/username login.
  const res = await fetch(`${baseUrl}/General/LoginPublisherAccountById`, {
    method: "POST",
    headers: SHARE_HEADERS,
    body: JSON.stringify({ accountId, password, applicationId: APPLICATION_ID }),
  });

  const text = await res.text();

  if (!res.ok || !text.trim()) {
    throw new Error(`Dexcom Share auth failed — HTTP ${res.status}: "${text}"`);
  }

  let sessionId: string;
  try {
    sessionId = JSON.parse(text);
  } catch {
    throw new Error(`Dexcom Share auth returned non-JSON body: "${text}"`);
  }

  if (!sessionId || sessionId === "00000000-0000-0000-0000-000000000000") {
    throw new Error("Dexcom Share auth rejected — verify account ID, password, and region setting");
  }

  const entry: SessionEntry = { sessionId, baseUrl, expiresAt: Date.now() + SESSION_TTL_MS };
  sessionCache.set(userId, entry);
  return entry;
}

interface DexcomReading {
  WT: string;
  Value: number;
  Trend: string;
}

// Returns null specifically when Dexcom signals the session is no longer valid,
// so the caller can re-authenticate and retry exactly once.
async function fetchReadings(
  sessionId: string,
  baseUrl: string
): Promise<DexcomReading[] | null> {
  // Fetch only the 3 most recent readings — enough to cover one 5-minute poll
  // window with a buffer for any readings we may have missed.
  const url =
    `${baseUrl}/Publisher/ReadPublisherLatestGlucoseValues` +
    `?sessionId=${encodeURIComponent(sessionId)}&minutes=10&maxCount=3`;

  const res = await fetch(url, { method: "POST", headers: SHARE_HEADERS });
  const text = await res.text();

  // Dexcom returns HTTP 500 with a "SessionNotValid" / "SessionIdNotFound" body
  // when the session has expired rather than a proper 401.
  if (!res.ok) {
    if (
      res.status === 500 &&
      (text.includes("SessionNotValid") || text.includes("SessionIdNotFound"))
    ) {
      return null; // caller will re-authenticate and retry
    }
    throw new Error(`Dexcom Share readings fetch failed — HTTP ${res.status}: "${text}"`);
  }

  if (!text.trim()) {
    throw new Error(
      "Dexcom Share returned an empty response — ensure Share is enabled on your receiver or phone"
    );
  }

  const readings: DexcomReading[] = JSON.parse(text);

  // An empty array can also indicate a stale/invalid session in some firmware versions.
  if (readings.length === 0) {
    return null;
  }

  return readings;
}

// Dexcom encodes timestamps as "Date(1691455258000)" — no leading slash.
// A regex expecting a leading slash silently fails and would default every reading
// to the current time, clustering all data at one point ("picket fence" bug).
function parseDexcomDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const match = /Date\((\d+)\)/.exec(raw);
  if (!match) return null;
  return new Date(Number(match[1]));
}

export interface SyncResult {
  inserted: number;
  duplicate: number;
  unparseable: number;
}

export async function syncDexcomShareGlucose(
  userId: string,
  log?: FastifyBaseLogger
): Promise<SyncResult> {
  let session = await authenticate(userId);

  let readings = await fetchReadings(session.sessionId, session.baseUrl);

  if (readings === null) {
    // Session was rejected mid-flight (expired between our TTL check and the API call).
    // Evict the cache, re-authenticate once, and retry.
    sessionCache.delete(userId);
    log?.warn("Dexcom Share session expired mid-flight — re-authenticating");
    session = await authenticate(userId);
    readings = await fetchReadings(session.sessionId, session.baseUrl);

    if (readings === null) {
      throw new Error(
        "Dexcom Share session still invalid after re-authentication — check credentials"
      );
    }
  }

  // Pre-filter: separate parseable readings from bad timestamps in one pass
  type Parseable = { recordedAt: Date; mg_dl: number; trend: string };
  const parseable: Parseable[] = [];
  let unparseable = 0;

  for (const r of readings) {
    const recordedAt = parseDexcomDate(r.WT);
    if (!recordedAt) {
      // Skip readings with unparseable timestamps — never fabricate a fallback date.
      unparseable++;
      log?.warn({ raw: r.WT }, "Could not parse Dexcom timestamp — skipping reading");
      continue;
    }
    parseable.push({ recordedAt, mg_dl: r.Value, trend: r.Trend });
  }

  let inserted = 0;
  let duplicate = 0;

  if (parseable.length > 0) {
    const { rowCount } = await pool.query(
      `INSERT INTO glucose_readings (user_id, recorded_at, mg_dl, trend, source)
       SELECT $1::uuid, unnest($2::timestamptz[]), unnest($3::int[]), unnest($4::text[]), 'dexcom_share'
       ON CONFLICT (user_id, recorded_at) DO NOTHING`,
      [
        userId,
        parseable.map(r => r.recordedAt.toISOString()),
        parseable.map(r => r.mg_dl),
        parseable.map(r => r.trend),
      ]
    );
    inserted = rowCount ?? 0;
    duplicate = parseable.length - inserted;
  }

  return { inserted, duplicate, unparseable };
}
