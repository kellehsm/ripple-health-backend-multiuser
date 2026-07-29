import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function tabPreferencesRoutes(app: FastifyInstance) {
  // GET /api/user/tab-preferences
  app.get("/", async (req, reply) => {
    const user_id = req.user_id;
    const rows = await query<any>(
      "SELECT settings FROM user_settings WHERE user_id = $1",
      [user_id]
    );
    const prefs = rows[0]?.settings?.tab_preferences ?? null;
    if (!prefs) {
      return reply.status(404).send({ error: "not_found" });
    }
    return prefs;
  });

  // PUT /api/user/tab-preferences
  app.put("/", async (req) => {
    const user_id = req.user_id;
    const prefs = req.body as object;

    // Upsert: merge tab_preferences into existing settings without a read-first round-trip
    await query(
      `INSERT INTO user_settings (user_id, settings)
       VALUES ($1, jsonb_build_object('tab_preferences', $2::jsonb))
       ON CONFLICT (user_id)
       DO UPDATE SET settings = user_settings.settings || jsonb_build_object('tab_preferences', $2::jsonb)`,
      [user_id, JSON.stringify(prefs)]
    );
    return { ok: true };
  });
}
