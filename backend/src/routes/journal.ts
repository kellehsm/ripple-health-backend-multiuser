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

  app.get("/today", async (req) => {
    const { user_id } = req.query as any;
    return query(
      `SELECT * FROM journal_entries
       WHERE user_id = $1 AND logged_at::date = current_date
       ORDER BY logged_at ASC`,
      [user_id]
    );
  });

  // 7-day daily summary: avg mood + sleep hours + total spending per day.
  // Used for the correlation view on the Overview screen.
  app.get("/weekly-summary", async (req) => {
    const { user_id } = req.query as any;
    const rows = await query<any>(
      `SELECT
         d::date AS date,
         (SELECT AVG(mood_score)
          FROM journal_entries
          WHERE user_id = $1 AND logged_at::date = d::date) AS avg_mood,
         (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))) / 3600.0, 0)
          FROM sleep_sessions
          WHERE user_id = $1 AND start_time::date = d::date) AS sleep_hours,
         (SELECT COALESCE(SUM(amount), 0)
          FROM spending_entries
          WHERE user_id = $1 AND logged_at::date = d::date) AS total_spent
       FROM generate_series(
         current_date - interval '6 days',
         current_date,
         interval '1 day'
       ) AS d
       ORDER BY d`,
      [user_id]
    );
    return rows.map((r: any) => ({
      date: r.date,
      avg_mood: r.avg_mood !== null ? Number(Number(r.avg_mood).toFixed(1)) : null,
      sleep_hours: Number(Number(r.sleep_hours).toFixed(1)),
      total_spent: Number(Number(r.total_spent).toFixed(2)),
    }));
  });
}
