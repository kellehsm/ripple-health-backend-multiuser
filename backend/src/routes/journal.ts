import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function journalRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { user_id } = req.query as any;
    return query(`SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50`, [user_id]);
  });

  app.post("/", async (req) => {
    const { user_id, mood_score, entry_text, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO journal_entries (user_id, mood_score, entry_text, logged_at)
       VALUES ($1,$2,$3, COALESCE($4, now())) RETURNING *`,
      [user_id, mood_score, entry_text, logged_at]
    );
    return rows[0];
  });
}
