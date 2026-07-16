import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { backupToGoogleDrive } from "../jobs/google-drive-backup.js";

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

export default async function googleDriveRoutes(app: FastifyInstance) {
  app.get("/status", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const gd = rows[0]?.settings?.google_drive ?? {};
    return {
      connected: !!gd.refresh_token,
      last_backup: gd.last_backup ?? null,
      auto_backup: gd.auto_backup ?? false,
      connected_at: gd.connected_at ?? null,
    };
  });

  app.post("/backup", async (req) => {
    const user_id = req.user_id;
    const filename = await backupToGoogleDrive(user_id);
    return { ok: true, filename };
  });

  app.patch("/auto-backup", async (req) => {
    const user_id = req.user_id;
    const { enabled } = req.body as any;
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const existing = rows[0]?.settings ?? {};
    const merged = {
      ...existing,
      google_drive: { ...existing.google_drive, auto_backup: !!enabled },
    };
    await query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb`,
      [user_id, JSON.stringify(merged)]
    );
    return { ok: true };
  });

  app.post("/disconnect", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const existing = rows[0]?.settings ?? {};
    const { google_drive: _removed, ...rest } = existing;
    await query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb`,
      [user_id, JSON.stringify(rest)]
    );
    return { ok: true };
  });

  app.get("/list-backups", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const gd = rows[0]?.settings?.google_drive;
    if (!gd?.refresh_token) throw new Error("Google Drive not connected");

    const accessToken = await refreshAccessToken(gd.refresh_token);
    const listRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?" +
        new URLSearchParams({
          q: "name contains 'ripple-backup-' and name contains '.json' and trashed=false",
          fields: "files(id,name,createdTime,size)",
          orderBy: "createdTime desc",
        }),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) throw new Error("Drive list failed: " + (await listRes.text()));
    const data: any = await listRes.json();
    return { files: data.files ?? [] };
  });

  app.post("/restore", async (req) => {
    const user_id = req.user_id;
    const { file_id } = req.body as any;
    if (!file_id) throw new Error("file_id required");

    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const gd = rows[0]?.settings?.google_drive;
    if (!gd?.refresh_token) throw new Error("Google Drive not connected");

    const accessToken = await refreshAccessToken(gd.refresh_token);

    const fileRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!fileRes.ok) throw new Error("Drive download failed: " + (await fileRes.text()));
    const backup: any = await fileRes.json();

    const counts: Record<string, number> = {};

    async function ins(sql: string, vals: any[]): Promise<number> {
      const result = await query<any>(sql, vals);
      return (result as any).rowCount ?? 0;
    }

    // glucose_readings
    let n = 0;
    for (const r of backup.glucose ?? []) {
      try { n += await ins(`INSERT INTO glucose_readings (id,user_id,recorded_at,mg_dl,trend,source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.recorded_at, r.mg_dl, r.trend, r.source ?? "dexcom"]); } catch (_) {}
    }
    counts.glucose_readings = n;

    // meals
    n = 0;
    for (const r of backup.meals ?? []) {
      try { n += await ins(`INSERT INTO meals (id,user_id,logged_at,name,meal_type,carbs_g,sugar_g,calories,source_db,source_food_id,context) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.logged_at, r.name, r.meal_type, r.carbs_g, r.sugar_g, r.calories, r.source_db, r.source_food_id, r.context ?? null]); } catch (_) {}
    }
    counts.meals = n;

    // journal_entries
    n = 0;
    for (const r of backup.journal ?? []) {
      try { n += await ins(`INSERT INTO journal_entries (id,user_id,logged_at,mood_score,entry_text,context) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.logged_at, r.mood_score, r.entry_text, r.context ?? null]); } catch (_) {}
    }
    counts.journal_entries = n;

    // spending_entries
    n = 0;
    for (const r of backup.spending ?? []) {
      try { n += await ins(`INSERT INTO spending_entries (id,user_id,logged_at,amount,category,source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.logged_at, r.amount, r.category, r.source ?? "manual"]); } catch (_) {}
    }
    counts.spending_entries = n;

    // books
    n = 0;
    for (const r of backup.books ?? []) {
      try { n += await ins(`INSERT INTO books (id,user_id,title,author,cover_url,total_pages,status,rating,started_at,finished_at,total_chapters,current_chapter) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.title, r.author, r.cover_url, r.total_pages, r.status, r.rating, r.started_at, r.finished_at, r.total_chapters, r.current_chapter]); } catch (_) {}
    }
    counts.books = n;

    // hobbies (must come before hobby_logs so FK references resolve)
    n = 0;
    for (const r of backup.hobbies ?? []) {
      try { n += await ins(`INSERT INTO hobbies (id,user_id,name,unit_label,icon,color_key) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.name, r.unit_label, r.icon, r.color_key]); } catch (_) {}
    }
    counts.hobbies = n;

    // hobby_logs (hobby_id references hobbies.id which we just restored)
    n = 0;
    for (const r of backup.hobby_logs ?? []) {
      try { n += await ins(`INSERT INTO hobby_logs (id,hobby_id,logged_at,amount,rating,note) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [r.id, r.hobby_id, r.logged_at, r.amount, r.rating, r.note]); } catch (_) {}
    }
    counts.hobby_logs = n;

    // sleep_sessions
    n = 0;
    for (const r of backup.sleep_sessions ?? []) {
      try { n += await ins(`INSERT INTO sleep_sessions (id,user_id,start_time,end_time,quality_score,source) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.start_time, r.end_time, r.quality_score, r.source ?? "health_connect"]); } catch (_) {}
    }
    counts.sleep_sessions = n;

    // heart_rate_readings
    n = 0;
    for (const r of backup.heart_rate ?? []) {
      try { n += await ins(`INSERT INTO heart_rate_readings (id,user_id,recorded_at,bpm,source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.recorded_at, r.bpm, r.source ?? "health_connect"]); } catch (_) {}
    }
    counts.heart_rate_readings = n;

    // metrics (must come before metric_logs)
    n = 0;
    for (const r of backup.metrics ?? []) {
      try { n += await ins(`INSERT INTO metrics (id,user_id,name,value_type,unit,icon,color_key) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`, [r.id, user_id, r.name, r.value_type, r.unit, r.icon, r.color_key]); } catch (_) {}
    }
    counts.metrics = n;

    // metric_logs (metric_id references metrics.id which we just restored)
    n = 0;
    for (const r of backup.metric_logs ?? []) {
      try { n += await ins(`INSERT INTO metric_logs (id,metric_id,logged_at,value,note) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, [r.id, r.metric_id, r.logged_at, r.value, r.note]); } catch (_) {}
    }
    counts.metric_logs = n;

    return { ok: true, counts };
  });
}
