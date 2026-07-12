import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function settingsRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { user_id } = req.query as any;
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const settings = rows[0]?.settings ?? {};
    // Mask Dexcom password: return a boolean instead of the value
    if (settings.dexcom) {
      const { share_password, ...rest } = settings.dexcom;
      settings.dexcom = { ...rest, share_password_set: !!share_password };
    }
    return settings;
  });

  app.patch("/", async (req) => {
    const { user_id, ...patch } = req.body as any;
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const existing = rows[0]?.settings ?? {};

    // One-level deep merge so nested keys (dexcom, week_start, etc.) are merged, not replaced
    const merged: Record<string, any> = { ...existing };
    for (const key of Object.keys(patch)) {
      if (
        patch[key] !== null &&
        typeof patch[key] === "object" &&
        !Array.isArray(patch[key]) &&
        merged[key] !== null &&
        typeof merged[key] === "object"
      ) {
        merged[key] = { ...merged[key], ...patch[key] };
      } else {
        merged[key] = patch[key];
      }
    }

    // Don't overwrite existing Dexcom password when an empty string is sent
    if (patch.dexcom?.share_password === "" && existing?.dexcom?.share_password) {
      merged.dexcom.share_password = existing.dexcom.share_password;
    }

    await query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb`,
      [user_id, JSON.stringify(merged)]
    );
    return { ok: true };
  });
}
