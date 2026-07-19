import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function mindfulnessRoutes(app: FastifyInstance) {
  // POST /api/mindfulness/log — log a mindfulness session
  app.post("/log", async (req, reply) => {
    const user_id = req.user_id;
    const { type, duration_seconds } = req.body as any;
    if (!type) return reply.code(400).send({ error: "type is required" });

    // Get or create a mindfulness metric for this user
    let metricId: string | null = null;
    const existing = await query<{ id: string }>(
      `SELECT id FROM metrics WHERE user_id = $1 AND name = 'mindfulness'`,
      [user_id]
    );
    if (existing.length > 0) {
      metricId = existing[0].id;
    } else {
      const [created] = await query<{ id: string }>(
        `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
         VALUES ($1, 'mindfulness', 'number', 'sessions', 'meditation', 'teal')
         RETURNING id`,
        [user_id]
      );
      metricId = created.id;
    }

    await query(
      `INSERT INTO metric_logs (metric_id, value, note, logged_at)
       VALUES ($1, 1, $2, NOW())`,
      [metricId, duration_seconds != null ? `type:${type} duration:${duration_seconds}s` : `type:${type}`]
    );

    return { ok: true };
  });
}
