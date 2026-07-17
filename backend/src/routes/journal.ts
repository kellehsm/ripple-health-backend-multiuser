import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function journalRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    return query(`SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50`, [user_id]);
  });

  // Upsert a period check-in (one per period per day) or insert an off-cycle moment.
  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { mood_score, entry_text, logged_at, mood_label, period, entry_type, context } = req.body as any;
    const type = entry_type ?? "period";
    const contextJson = context ? JSON.stringify(context) : null;

    if (type === "period" && period) {
      // Upsert: update existing entry for this user+period+today, or insert
      const existing = await query<any>(
        `SELECT id FROM journal_entries
         WHERE user_id = $1 AND period = $2 AND logged_at::date = CURRENT_DATE`,
        [user_id, period]
      );
      if (existing.length > 0) {
        const rows = await query(
          `UPDATE journal_entries
           SET mood_score = $1, mood_label = $2, entry_text = $3,
               logged_at = COALESCE($4, now()),
               context = CASE WHEN $5::jsonb IS NOT NULL THEN $5::jsonb ELSE context END
           WHERE id = $6 RETURNING *`,
          [mood_score, mood_label ?? null, entry_text ?? null, logged_at ?? null, contextJson, existing[0].id]
        );
        return rows[0];
      }
    }

    const rows = await query(
      `INSERT INTO journal_entries (user_id, mood_score, mood_label, entry_text, period, entry_type, context, logged_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8, now())) RETURNING *`,
      [user_id, mood_score, mood_label ?? null, entry_text ?? null, period ?? null, type, contextJson, logged_at ?? null]
    );
    return rows[0];
  });

  app.get("/today", async (req) => {
    const user_id = req.user_id;
    return query(
      `SELECT * FROM journal_entries
       WHERE user_id = $1 AND logged_at::date = current_date
       ORDER BY logged_at ASC`,
      [user_id]
    );
  });

  // Daily summary: avg mood (period check-ins only) + sleep hours + total spending per day.
  // ?days=N controls window size (default 7, max 90).
  app.get("/weekly-summary", async (req) => {
    const user_id = req.user_id;
    const { days: daysStr } = req.query as any;
    const days = Math.min(Math.max(parseInt(daysStr ?? "7", 10) || 7, 7), 90);
    const rows = await query<any>(
      `SELECT
         d::date AS date,
         (SELECT AVG(mood_score)
          FROM journal_entries
          WHERE user_id = $1 AND logged_at::date = d::date AND entry_type != 'moment') AS avg_mood,
         (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))) / 3600.0, 0)
          FROM sleep_sessions
          WHERE user_id = $1 AND end_time::date = d::date) AS sleep_hours,
         (SELECT COALESCE(SUM(amount), 0)
          FROM spending_entries
          WHERE user_id = $1 AND logged_at::date = d::date) AS total_spent
       FROM generate_series(
         current_date - ($2 - 1) * interval '1 day',
         current_date,
         interval '1 day'
       ) AS d
       ORDER BY d`,
      [user_id, days]
    );
    return rows.map((r: any) => ({
      date: r.date,
      avg_mood: r.avg_mood !== null ? Number(Number(r.avg_mood).toFixed(1)) : null,
      sleep_hours: Number(Number(r.sleep_hours).toFixed(1)),
      total_spent: Number(Number(r.total_spent).toFixed(2)),
    }));
  });
}
