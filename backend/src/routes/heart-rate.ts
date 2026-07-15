import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function heartRateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const { start, end } = req.query as any;
    if (start && end) {
      return query(
        `SELECT recorded_at, bpm FROM heart_rate_readings
         WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3
         ORDER BY recorded_at`,
        [user_id, start, end]
      );
    }
    return query(
      `SELECT recorded_at, bpm FROM heart_rate_readings
       WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 288`,
      [user_id]
    );
  });

  app.get("/daily", async (req) => {
    const user_id = req.user_id;
    const { days = "7" } = req.query as any;
    const n = Math.min(Math.max(parseInt(days, 10) || 7, 1), 30);
    return query<any>(
      `SELECT
         date_trunc('day', recorded_at AT TIME ZONE 'UTC')::date AS date,
         MIN(bpm)::int   AS resting_bpm,
         MAX(bpm)::int   AS peak_bpm,
         ROUND(AVG(bpm))::int AS avg_bpm,
         COUNT(*)::int   AS reading_count
       FROM heart_rate_readings
       WHERE user_id = $1
         AND recorded_at >= NOW() - ($2 || ' days')::interval
       GROUP BY 1
       ORDER BY 1 DESC`,
      [user_id, n]
    );
  });
}
