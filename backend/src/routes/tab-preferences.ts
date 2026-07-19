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

    // Merge into existing settings so we don't clobber other setting keys
    const rows = await query<any>(
      "SELECT settings FROM user_settings WHERE user_id = $1",
      [user_id]
    );
    const existing = rows[0]?.settings ?? {};
    const updated = { ...existing, tab_preferences: prefs };

    await query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb`,
      [user_id, JSON.stringify(updated)]
    );
    return { ok: true };
  });
}
