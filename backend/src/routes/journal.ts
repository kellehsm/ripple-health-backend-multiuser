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
      `WITH
         date_series AS (
           SELECT generate_series(
             current_date - ($2 - 1) * interval '1 day',
             current_date,
             interval '1 day'
           )::date AS day
         ),
         mood_agg AS (
           SELECT logged_at::date AS day, AVG(mood_score) AS avg_mood
           FROM journal_entries
           WHERE user_id = $1
             AND logged_at >= current_date - ($2 - 1) * interval '1 day'
             AND logged_at < current_date + interval '1 day'
             AND entry_type != 'moment'
           GROUP BY logged_at::date
         ),
         sleep_agg AS (
           SELECT end_time::date AS day,
                  COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))) / 3600.0, 0) AS sleep_hours
           FROM sleep_sessions
           WHERE user_id = $1
             AND end_time >= current_date - ($2 - 1) * interval '1 day'
             AND end_time < current_date + interval '1 day'
           GROUP BY end_time::date
         ),
         spending_agg AS (
           SELECT logged_at::date AS day, COALESCE(SUM(amount), 0) AS total_spent
           FROM spending_entries
           WHERE user_id = $1
             AND logged_at >= current_date - ($2 - 1) * interval '1 day'
             AND logged_at < current_date + interval '1 day'
           GROUP BY logged_at::date
         ),
         steps_agg AS (
           SELECT ml.logged_at::date AS day, COALESCE(MAX(ml.value), 0) AS steps
           FROM metric_logs ml
           JOIN metrics m ON m.id = ml.metric_id
           WHERE m.user_id = $1 AND m.name = 'steps'
             AND ml.logged_at >= current_date - ($2 - 1) * interval '1 day'
             AND ml.logged_at < current_date + interval '1 day'
           GROUP BY ml.logged_at::date
         ),
         exercise_agg AS (
           SELECT started_at::date AS day,
                  COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0), 0) AS exercise_minutes
           FROM exercise_sessions
           WHERE user_id = $1 AND ended_at IS NOT NULL
             AND started_at >= current_date - ($2 - 1) * interval '1 day'
             AND started_at < current_date + interval '1 day'
           GROUP BY started_at::date
         )
       SELECT
         ds.day AS date,
         m.avg_mood,
         COALESCE(sl.sleep_hours, 0) AS sleep_hours,
         COALESCE(sp.total_spent, 0) AS total_spent,
         COALESCE(st.steps, 0) AS steps,
         COALESCE(ex.exercise_minutes, 0) AS exercise_minutes
       FROM date_series ds
       LEFT JOIN mood_agg m ON m.day = ds.day
       LEFT JOIN sleep_agg sl ON sl.day = ds.day
       LEFT JOIN spending_agg sp ON sp.day = ds.day
       LEFT JOIN steps_agg st ON st.day = ds.day
       LEFT JOIN exercise_agg ex ON ex.day = ds.day
       ORDER BY ds.day`,
      [user_id, days]
    );
    return rows.map((r: any) => ({
      date: r.date,
      avg_mood: r.avg_mood !== null ? Number(Number(r.avg_mood).toFixed(1)) : null,
      sleep_hours: Number(Number(r.sleep_hours).toFixed(1)),
      total_spent: Number(Number(r.total_spent).toFixed(2)),
      steps: Number(r.steps),
      exercise_minutes: Number(Number(r.exercise_minutes).toFixed(0)),
    }));
  });
}
