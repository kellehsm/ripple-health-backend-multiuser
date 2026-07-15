import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { backupToGoogleDrive } from "../jobs/google-drive-backup.js";

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
}
