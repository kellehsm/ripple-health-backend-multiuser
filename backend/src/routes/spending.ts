import { FastifyInstance } from "fastify";
import { query } from "../db.js";

// Manual entry for now. Later this can be filled by a Goldfinch export/webhook
// (source = 'goldfinch_import') without changing the schema or the app UI.
export default async function spendingRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const { since } = req.query as any;
    if (since) {
      return query(
        `SELECT * FROM spending_entries WHERE user_id = $1 AND logged_at >= $2 ORDER BY logged_at DESC`,
        [user_id, since]
      );
    }
    return query(`SELECT * FROM spending_entries WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 100`, [user_id]);
  });

  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { amount, category, source, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO spending_entries (user_id, amount, category, source, logged_at)
       VALUES ($1,$2,$3, COALESCE($4,'manual'), COALESCE($5, now())) RETURNING *`,
      [user_id, amount, category, source, logged_at]
    );
    return rows[0];
  });
}
