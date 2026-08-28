import { FastifyInstance } from "fastify";
import { pool, query } from "../db.js";
import { backupToGoogleDrive } from "../jobs/google-drive-backup.js";
import { fetchWithTimeout } from "../lib/http.js";
import { decryptCredential } from "../lib/credCrypto.js";

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
    // Derive a client-side "stale" flag so the UI doesn't have to duplicate
    // this math. Anything >7 days old is stale; >30 days is critical.
    const lastMs = gd.last_backup ? new Date(gd.last_backup).getTime() : 0;
    const ageDays = lastMs ? Math.floor((Date.now() - lastMs) / 86_400_000) : null;
    const stale    = ageDays != null && ageDays > 7;
    const critical = ageDays != null && ageDays > 30;
    return {
      connected: !!gd.refresh_token,
      last_backup: gd.last_backup ?? null,
      last_backup_age_days: ageDays,
      last_backup_stale: stale,
      last_backup_critical: critical,
      last_verified_at: gd.last_verified_at ?? null,
      last_verified_ok: gd.last_verified_ok ?? null,
      auto_backup: gd.auto_backup ?? false,
      connected_at: gd.connected_at ?? null,
    };
  });

  // POST /verify-latest — reach out to Drive, list backups, HEAD the newest
  // file to confirm it's actually there and readable. Cheap end-to-end
  // sanity check so users know their backup isn't silently broken.
  app.post("/verify-latest", async (req, reply) => {
    const user_id = req.user_id;
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const gd = rows[0]?.settings?.google_drive ?? {};
    if (!gd.refresh_token) return reply.code(400).send({ error: "Google Drive not connected" });
    try {
      const accessToken = await refreshAccessToken(decryptCredential(gd.refresh_token));
      const listRes = await fetchWithTimeout(
        "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,size)",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const listJson: any = await listRes.json();
      const file = listJson?.files?.[0];
      if (!file) {
        await recordVerify(user_id, false, "no backups found");
        return { ok: false, reason: "no backups found" };
      }
      // HEAD-style check: request 1 byte of the file to confirm it's readable
      const headRes = await fetchWithTimeout(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}`, Range: "bytes=0-0" } }
      );
      const readable = headRes.status === 200 || headRes.status === 206;
      await recordVerify(user_id, readable, readable ? null : `HTTP ${headRes.status}`);
      return {
        ok: readable,
        latest: { id: file.id, name: file.name, modifiedTime: file.modifiedTime, size: file.size },
      };
    } catch (e: any) {
      await recordVerify(user_id, false, e?.message ?? "unknown");
      return reply.code(500).send({ ok: false, error: e?.message ?? "verify failed" });
    }
  });

  async function recordVerify(userId: string, ok: boolean, reason: string | null) {
    // Stamp last_verified_* alongside last_backup — jsonb_set-per-key so we
    // never clobber sibling google_drive fields (refresh_token etc.).
    await query(
      `UPDATE user_settings
       SET settings = jsonb_set(
              jsonb_set(
                jsonb_set(settings, '{google_drive,last_verified_at}', to_jsonb($2::text)),
                '{google_drive,last_verified_ok}', to_jsonb($3::boolean)
              ),
              '{google_drive,last_verified_reason}', to_jsonb($4::text)
            )
       WHERE user_id = $1`,
      [userId, new Date().toISOString(), ok, reason]
    );
  }

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

    const accessToken = await refreshAccessToken(decryptCredential(gd.refresh_token));
    const listRes = await fetchWithTimeout(
      "https://www.googleapis.com/drive/v3/files?" +
        new URLSearchParams({
          q: "name contains 'ripple-backup-' and name contains '.json' and trashed=false",
          fields: "files(id,name,createdTime,size)",
          orderBy: "createdTime desc",
        }),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) {
      // Log the Drive response server-side only — API response bodies must not
      // leak into 500 responses sent to the client.
      app.log.error({ status: listRes.status, body: await listRes.text() }, "Drive list failed");
      throw new Error(`Drive list failed (status ${listRes.status})`);
    }
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

    const accessToken = await refreshAccessToken(decryptCredential(gd.refresh_token));

    const fileRes = await fetchWithTimeout(
      `https://www.googleapis.com/drive/v3/files/${file_id}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      30000,
    );
    if (!fileRes.ok) {
      // Log the Drive response server-side only — API response bodies must not
      // leak into 500 responses sent to the client.
      app.log.error({ status: fileRes.status, body: await fileRes.text() }, "Drive download failed");
      throw new Error(`Drive download failed (status ${fileRes.status})`);
    }
    const backup: any = await fileRes.json();

    const counts: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const CHUNK = 500;

    // The whole restore runs in a single transaction: a mid-restore DB error
    // rolls everything back and surfaces, instead of silently "succeeding"
    // with a partial restore.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Bulk-insert helper: chunks rows into groups of CHUNK and builds multi-row VALUES.
      // Returns total inserted count. Rows that conflict are skipped (DO NOTHING);
      // any other DB error aborts the whole restore.
      const bulkInsert = async (
        tableName: string,
        cols: string[],
        rows: any[],
        rowMapper: (r: any) => any[]
      ): Promise<number> => {
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
          const res = await client.query(
            `INSERT INTO ${tableName} (${cols.join(",")}) VALUES ${valueClauses.join(",")} ON CONFLICT (id) DO NOTHING`,
            params
          );
          total += res.rowCount ?? 0;
        }
        return total;
      };

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

      // hobby_logs: hobby_id comes straight from the backup JSON, so only accept
      // rows pointing at hobbies this user actually owns — a crafted backup must
      // not be able to write onto another user's hobby. Invalid rows are
      // skipped and reported.
      const { rows: ownedHobbies } = await client.query(
        `SELECT id FROM hobbies WHERE user_id = $1`, [user_id]
      );
      const hobbyIdSet = new Set(ownedHobbies.map((r: any) => r.id));
      const allHobbyLogs: any[] = backup.hobby_logs ?? [];
      const validHobbyLogs = allHobbyLogs.filter((r) => hobbyIdSet.has(r.hobby_id));
      skipped.hobby_logs = allHobbyLogs.length - validHobbyLogs.length;
      counts.hobby_logs = await bulkInsert(
        "hobby_logs",
        ["id","hobby_id","logged_at","amount","rating","note"],
        validHobbyLogs,
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

      // metric_logs: same ownership rule as hobby_logs — metric_id must belong
      // to this user. Invalid rows are skipped and reported.
      const { rows: ownedMetrics } = await client.query(
        `SELECT id FROM metrics WHERE user_id = $1`, [user_id]
      );
      const metricIdSet = new Set(ownedMetrics.map((r: any) => r.id));
      const allMetricLogs: any[] = backup.metric_logs ?? [];
      const validMetricLogs = allMetricLogs.filter((r) => metricIdSet.has(r.metric_id));
      skipped.metric_logs = allMetricLogs.length - validMetricLogs.length;
      counts.metric_logs = await bulkInsert(
        "metric_logs",
        ["id","metric_id","logged_at","value","note"],
        validMetricLogs,
        (r) => [r.id, r.metric_id, r.logged_at, r.value, r.note]
      );

      await client.query("COMMIT");
    } catch (err: any) {
      await client.query("ROLLBACK");
      app.log.error({ err, user_id, file_id }, "Restore failed — rolled back");
      throw new Error(`Restore failed, no data was changed: ${err?.message ?? "database error"}`);
    } finally {
      client.release();
    }

    return { ok: true, counts, skipped };
  });
}
