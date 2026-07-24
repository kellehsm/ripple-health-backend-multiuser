import { query } from "../db.js";

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  const data: any = await res.json();
  if (!data.access_token) throw new Error("Token refresh failed: " + JSON.stringify(data));
  return data.access_token;
}

export async function backupToGoogleDrive(userId: string): Promise<string> {
  const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [userId]);
  const gd = rows[0]?.settings?.google_drive;
  if (!gd?.refresh_token) throw new Error("Google Drive not connected");

  const accessToken = await refreshAccessToken(gd.refresh_token);

  // Export all user data as JSON (same format as GET /export/all)
  const [glucose, meals, journal, spending, books, hobbies, hobbiesLogs, sleep, heartRate, metrics, metricLogs] =
    await Promise.all([
      query<any>(`SELECT * FROM glucose_readings WHERE user_id = $1 ORDER BY recorded_at`, [userId]),
      query<any>(`SELECT * FROM meals WHERE user_id = $1 ORDER BY logged_at`, [userId]),
      query<any>(`SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY logged_at`, [userId]),
      query<any>(`SELECT * FROM spending_entries WHERE user_id = $1 ORDER BY logged_at`, [userId]),
      query<any>(`SELECT * FROM books WHERE user_id = $1`, [userId]),
      query<any>(`SELECT * FROM hobbies WHERE user_id = $1`, [userId]),
      query<any>(`SELECT hl.* FROM hobby_logs hl JOIN hobbies h ON h.id = hl.hobby_id WHERE h.user_id = $1 ORDER BY hl.logged_at`, [userId]),
      query<any>(`SELECT * FROM sleep_sessions WHERE user_id = $1 ORDER BY start_time`, [userId]),
      query<any>(`SELECT * FROM heart_rate_readings WHERE user_id = $1 ORDER BY recorded_at`, [userId]),
      query<any>(`SELECT * FROM metrics WHERE user_id = $1`, [userId]),
      query<any>(`SELECT ml.* FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id WHERE m.user_id = $1 ORDER BY ml.logged_at`, [userId]),
    ]);

  const payload = JSON.stringify({
    exported_at: new Date().toISOString(),
    user_id: userId,
    glucose,
    meals,
    journal,
    spending,
    books,
    hobbies,
    hobby_logs: hobbiesLogs,
    sleep_sessions: sleep,
    heart_rate: heartRate,
    metrics,
    metric_logs: metricLogs,
  });

  // Multipart upload to Google Drive
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `ripple-backup-${timestamp}.json`;
  const boundary = "ripple_boundary_" + Date.now();
  const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name: filename, mimeType: "application/json" })}\r\n`;
  const dataPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = Buffer.concat([Buffer.from(metaPart), Buffer.from(dataPart), Buffer.from(payload), Buffer.from(tail)]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!uploadRes.ok) throw new Error("Drive upload failed: " + (await uploadRes.text()));

  // Rotate — delete backups older than 14 days
  const listRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?" +
      new URLSearchParams({
        q: "name contains 'ripple-backup-' and trashed=false",
        fields: "files(id,name,createdTime)",
        orderBy: "createdTime",
      }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData: any = await listRes.json();
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const toDelete = (listData.files ?? []).filter(
    (f: any) => new Date(f.createdTime).getTime() < cutoff
  );
  await Promise.all(
    toDelete.map((f: any) =>
      fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    )
  );

  // Update last_backup timestamp using jsonb_set to avoid a second SELECT
  await query(
    `INSERT INTO user_settings (user_id, settings)
     VALUES ($1, jsonb_build_object('google_drive', jsonb_build_object('last_backup', $2::text)))
     ON CONFLICT (user_id) DO UPDATE
     SET settings = jsonb_set(
       jsonb_set(user_settings.settings, '{google_drive}', COALESCE(user_settings.settings->'google_drive', '{}'::jsonb), true),
       '{google_drive,last_backup}', to_jsonb($2::text), true
     )`,
    [userId, new Date().toISOString()]
  );

  return filename;
}
