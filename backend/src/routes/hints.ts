import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function hintsRoutes(app: FastifyInstance) {
  app.get("/:hint_key", async (req) => {
    const user_id = req.user_id;
    const { hint_key } = req.params as { hint_key: string };
    const rows = await query<{ hint_key: string }>(
      `SELECT hint_key FROM feature_hints_dismissed WHERE user_id = $1 AND hint_key = $2`,
      [user_id, hint_key]
    );
    return { dismissed: rows.length > 0 };
  });

  app.post("/:hint_key/dismiss", async (req) => {
    const user_id = req.user_id;
    const { hint_key } = req.params as { hint_key: string };
    await query(
      `INSERT INTO feature_hints_dismissed (user_id, hint_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user_id, hint_key]
    );
    return { ok: true };
  });
}
