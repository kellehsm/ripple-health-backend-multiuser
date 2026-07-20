import { FastifyInstance } from "fastify";
import { query } from "../db.js";

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
    const { amount, category, merchant_name, notes, source, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO spending_entries (user_id, amount, category, merchant_name, notes, source, logged_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'manual'), COALESCE($7, now())) RETURNING *`,
      [user_id, amount, category, merchant_name ?? null, notes ?? null, source, logged_at]
    );
    return rows[0];
  });

  app.patch("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const { category, notes } = req.body as any;
    const rows = await query(
      `UPDATE spending_entries SET category = $1, notes = $2
       WHERE id = $3 AND user_id = $4 RETURNING *`,
      [category ?? null, notes ?? null, id, user_id]
    );
    if (!rows[0]) return { error: "Not found" };
    return rows[0];
  });

  app.delete("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    await query(`DELETE FROM spending_entries WHERE id = $1 AND user_id = $2`, [id, user_id]);
    return { ok: true };
  });
}
