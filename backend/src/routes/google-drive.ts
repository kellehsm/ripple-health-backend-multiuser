import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { backupToGoogleDrive } from "../jobs/google-drive-backup.js";
import { fetchWithTimeout } from "../lib/http.js";

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
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
  if (!data.access_token) throw new Error(`Token refresh failed (status ${res.status})`);
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
    const listRes = await fetchWithTimeout(
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

    const fileRes = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      30000,
    );
    if (!fileRes.ok) throw new Error("Drive download failed: " + (await fileRes.text()));
    const backup: any = await fileRes.json();

    const counts: Record<string, number> = {};
    const CHUNK = 500;

    // Bulk-insert helper: chunks rows into groups of CHUNK and builds multi-row VALUES.
    // Returns total inserted count. Rows that conflict are silently skipped (DO NOTHING).
    async function bulkInsert(
      tableName: string,
      cols: string[],
      rows: any[],
      rowMapper: (r: any) => any[]
    ): Promise<number> {
      if (rows.length === 0) return 0;
      let total = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const params: any[] = [];
        const valueClauses = chunk.map((r) => {
          const vals = rowMapper(r);
          const start = params.length + 1;
          params.push(...vals);
          return `(${vals.map((_, j) => `$${start + j}`).join(",")})`;
        });
        try {
          const res = await query<any>(
            `INSERT INTO ${tableName} (${cols.join(",")}) VALUES ${valueClauses.join(",")} ON CONFLICT (id) DO NOTHING`,
            params
          );
          total += (res as any).rowCount ?? 0;
        } catch (_) {}
      }
      return total;
    }

    // glucose_readings
    counts.glucose_readings = await bulkInsert(
      "glucose_readings",
      ["id","user_id","recorded_at","mg_dl","trend","source"],
      backup.glucose ?? [],
      (r) => [r.id, user_id, r.recorded_at, r.mg_dl, r.trend, r.source ?? "dexcom"]
    );

    // meals
    counts.meals = await bulkInsert(
      "meals",
      ["id","user_id","logged_at","name","meal_type","carbs_g","sugar_g","calories","source_db","source_food_id","context"],
      backup.meals ?? [],
      (r) => [r.id, user_id, r.logged_at, r.name, r.meal_type, r.carbs_g, r.sugar_g, r.calories, r.source_db, r.source_food_id, r.context ?? null]
    );

    // journal_entries
    counts.journal_entries = await bulkInsert(
      "journal_entries",
      ["id","user_id","logged_at","mood_score","entry_text","context"],
      backup.journal ?? [],
      (r) => [r.id, user_id, r.logged_at, r.mood_score, r.entry_text, r.context ?? null]
    );

    // spending_entries
    counts.spending_entries = await bulkInsert(
      "spending_entries",
      ["id","user_id","logged_at","amount","category","source"],
      backup.spending ?? [],
      (r) => [r.id, user_id, r.logged_at, r.amount, r.category, r.source ?? "manual"]
    );

    // books
    counts.books = await bulkInsert(
      "books",
      ["id","user_id","title","author","cover_url","total_pages","status","rating","started_at","finished_at","total_chapters","current_chapter"],
      backup.books ?? [],
      (r) => [r.id, user_id, r.title, r.author, r.cover_url, r.total_pages, r.status, r.rating, r.started_at, r.finished_at, r.total_chapters, r.current_chapter]
    );

    // hobbies (must come before hobby_logs so FK references resolve)
    counts.hobbies = await bulkInsert(
      "hobbies",
      ["id","user_id","name","unit_label","icon","color_key"],
      backup.hobbies ?? [],
      (r) => [r.id, user_id, r.name, r.unit_label, r.icon, r.color_key]
    );

    // hobby_logs (hobby_id references hobbies.id which we just restored)
    counts.hobby_logs = await bulkInsert(
      "hobby_logs",
      ["id","hobby_id","logged_at","amount","rating","note"],
      backup.hobby_logs ?? [],
      (r) => [r.id, r.hobby_id, r.logged_at, r.amount, r.rating, r.note]
    );

    // sleep_sessions
    counts.sleep_sessions = await bulkInsert(
      "sleep_sessions",
      ["id","user_id","start_time","end_time","quality_score","source"],
      backup.sleep_sessions ?? [],
      (r) => [r.id, user_id, r.start_time, r.end_time, r.quality_score, r.source ?? "health_connect"]
    );

    // heart_rate_readings
    counts.heart_rate_readings = await bulkInsert(
      "heart_rate_readings",
      ["id","user_id","recorded_at","bpm","source"],
      backup.heart_rate ?? [],
      (r) => [r.id, user_id, r.recorded_at, r.bpm, r.source ?? "health_connect"]
    );

    // metrics (must come before metric_logs)
    counts.metrics = await bulkInsert(
      "metrics",
      ["id","user_id","name","value_type","unit","icon","color_key"],
      backup.metrics ?? [],
      (r) => [r.id, user_id, r.name, r.value_type, r.unit, r.icon, r.color_key]
    );

    // metric_logs (metric_id references metrics.id which we just restored)
    counts.metric_logs = await bulkInsert(
      "metric_logs",
      ["id","metric_id","logged_at","value","note"],
      backup.metric_logs ?? [],
      (r) => [r.id, r.metric_id, r.logged_at, r.value, r.note]
    );

    return { ok: true, counts };
  });
}
