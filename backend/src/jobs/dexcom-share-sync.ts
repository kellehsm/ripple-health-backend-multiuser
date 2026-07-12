import { pool, query } from "../db.js";

const APPLICATION_ID = "d8665ade-9673-4e27-9ff6-92db4ce13d13";

const HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Dexcom Share/3.0.2.11 CFNetwork/711.2.23 Darwin/14.0.0",
  "Accept": "application/json",
  "Accept-Language": "en-us",
};

async function login(userId?: string) {
  let accountId = process.env.DEXCOM_SHARE_ACCOUNT_ID;
  let password = process.env.DEXCOM_SHARE_PASSWORD;
  let region = process.env.DEXCOM_SHARE_REGION === "ous" ? "shareous1" : "share2";

  if (userId) {
    try {
      const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [userId]);
      const dexcom = rows[0]?.settings?.dexcom;
      if (dexcom?.share_account_id) accountId = dexcom.share_account_id;
      if (dexcom?.share_password) password = dexcom.share_password;
      if (dexcom?.share_region === "ous") region = "shareous1";
      else if (dexcom?.share_region === "us") region = "share2";
    } catch (_) {
      // fall through to env vars
    }
  }

  const BASE_URL = `https://${region}.dexcom.com/ShareWebServices/Services`;

  if (!accountId || !password) {
    throw new Error("Dexcom credentials not configured (set in Settings or .env)");
  }

  const res = await fetch(BASE_URL + "/General/LoginPublisherAccountById", {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({
      accountId: accountId,
      password: password,
      applicationId: APPLICATION_ID,
    }),
  });

  const text = await res.text();

  if (!res.ok || !text || text.trim().length === 0) {
    throw new Error("Dexcom Share login problem - status " + res.status + ", body: \"" + text + "\"");
  }

  let sessionId;
  try {
    sessionId = JSON.parse(text);
  } catch (e) {
    throw new Error("Dexcom Share login returned non-JSON body: \"" + text + "\"");
  }

  if (!sessionId || sessionId === "00000000-0000-0000-0000-000000000000") {
    throw new Error("Dexcom Share login rejected - check account ID/password/region");
  }

  return { sessionId, BASE_URL };
}

function parseDexcomDate(dateStr) {
  if (!dateStr) return null;
  const match = /Date\((\d+)/.exec(dateStr);
  if (!match) return null;
  return new Date(Number(match[1]));
}

export async function syncDexcomShareGlucose(userId) {
  const { sessionId, BASE_URL } = await login(userId);

  const res = await fetch(
    BASE_URL + "/Publisher/ReadPublisherLatestGlucoseValues?sessionId=" + sessionId + "&minutes=1440&maxCount=288",
    { method: "POST", headers: HEADERS }
  );

  const text = await res.text();
  if (!res.ok) return { error: "Dexcom Share glucose fetch failed: " + res.status + " - " + text };
  if (!text || text.trim().length === 0) return { error: "Dexcom returned an empty reading list - is Share turned on?" };

  const readings = JSON.parse(text);

  let inserted = 0;
  let skipped = 0;
  for (const r of readings) {
    const recordedAt = parseDexcomDate(r.WT);
    if (!recordedAt) {
      skipped++;
      continue;
    }

    const res = await pool.query(
      "INSERT INTO glucose_readings (user_id, recorded_at, mg_dl, trend, source) " +
      "VALUES ($1,$2,$3,$4,'dexcom_share') " +
      "ON CONFLICT (user_id, recorded_at) DO NOTHING",
      [userId, recordedAt.toISOString(), r.Value, r.Trend]
    );
    inserted += res.rowCount ?? 0;
  }

  return { ok: true, inserted: inserted, skipped: skipped };
}
