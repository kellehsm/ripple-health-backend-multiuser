import { query, pool } from "../db.js";

const API_BASE = process.env.DEXCOM_API_BASE ?? "https://sandbox-api.dexcom.com";

async function getValidAccessToken(userId: string): Promise<string | null> {
  const [row] = await query<any>(`SELECT * FROM dexcom_tokens WHERE user_id = $1`, [userId]);
  if (!row) return null;

  if (new Date(row.expires_at) > new Date()) return row.access_token;

  const body = new URLSearchParams({
    client_id: process.env.DEXCOM_CLIENT_ID!,
    client_secret: process.env.DEXCOM_CLIENT_SECRET!,
    refresh_token: row.refresh_token,
    grant_type: "refresh_token",
    redirect_uri: process.env.DEXCOM_REDIRECT_URI!,
  });

  const res = await fetch(`${API_BASE}/v2/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Dexcom token refresh failed: ${res.status}`);
  const tokens = await res.json();

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await query(
    `UPDATE dexcom_tokens SET access_token = $2, refresh_token = $3, expires_at = $4 WHERE user_id = $1`,
    [userId, tokens.access_token, tokens.refresh_token, expiresAt]
  );

  return tokens.access_token;
}

export async function syncDexcomGlucose(userId: string) {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return { error: "Dexcom not connected for this user" };

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 19);

  const url = `${API_BASE}/v3/users/self/egvs?startDate=${fmt(startDate)}&endDate=${fmt(endDate)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return { error: `Dexcom EGV fetch failed: ${res.status}` };

  const data = await res.json();
  const readings = data.records ?? [];

  if (!readings.length) return { ok: true, inserted: 0 };

  const result = await pool.query(
    `INSERT INTO glucose_readings (user_id, recorded_at, mg_dl, trend, source)
     SELECT $1::uuid, unnest($2::timestamptz[]), unnest($3::int[]), unnest($4::text[]), 'dexcom'
     ON CONFLICT (user_id, recorded_at) DO NOTHING`,
    [
      userId,
      readings.map((r: any) => r.systemTime),
      readings.map((r: any) => r.value),
      readings.map((r: any) => r.trend),
    ]
  );
  return { ok: true, inserted: result.rowCount ?? 0 };
}

