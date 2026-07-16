import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function healthConnectRoutes(app: FastifyInstance) {
  app.get("/steps", async (req) => {
    const user_id = req.user_id;
    const { date } = req.query as any;
    const [metric] = await query<any>(`SELECT id FROM metrics WHERE user_id = $1 AND name = 'steps'`, [user_id]);
    if (!metric) return { steps: null };
    const [row] = await query<any>(
      `SELECT MAX(value) as steps FROM metric_logs WHERE metric_id = $1 AND logged_at::date = $2`,
      [metric.id, date]
    );
    return { steps: row?.steps != null ? Number(row.steps) : null };
  });

  app.get("/sleep", async (req) => {
    const user_id = req.user_id;
    const { date } = req.query as any;
    const rows = await query<any>(
      `SELECT * FROM sleep_sessions
       WHERE user_id = $1 AND end_time >= $2::date AND end_time < $2::date + interval '1 day'
       ORDER BY end_time DESC LIMIT 1`,
      [user_id, date]
    );
    return rows[0] ?? null;
  });

  app.post("/heart-rate", async (req) => {
    const user_id = req.user_id;
    const { readings } = req.body as any;
    if (!readings?.length) return { ok: true, inserted: 0 };
    await query(
      `INSERT INTO heart_rate_readings (user_id, recorded_at, bpm)
       SELECT $1::uuid, unnest($2::timestamptz[]), unnest($3::int[])`,
      [user_id, readings.map((r: any) => r.recorded_at), readings.map((r: any) => r.bpm)]
    );
    return { ok: true, inserted: readings.length };
  });

  app.post("/sleep", async (req) => {
    const user_id = req.user_id;
    const { sessions } = req.body as any;
    if (!sessions?.length) return { ok: true, inserted: 0 };
    await query(
      `INSERT INTO sleep_sessions (user_id, start_time, end_time, quality_score)
       SELECT $1::uuid, unnest($2::timestamptz[]), unnest($3::timestamptz[]), unnest($4::float8[])`,
      [
        user_id,
        sessions.map((s: any) => s.start_time),
        sessions.map((s: any) => s.end_time),
        sessions.map((s: any) => s.quality_score ?? null),
      ]
    );
    return { ok: true, inserted: sessions.length };
  });

  app.get("/sleep/stats", async (req) => {
    const user_id = req.user_id;
    const [yesterday] = await query<any>(
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time))), 0) as seconds
       FROM sleep_sessions
       WHERE user_id = $1 AND start_time::date = current_date - interval '1 day'`,
      [user_id]
    );
    const [weekAvg] = await query<any>(
      `SELECT COALESCE(AVG(daily_seconds), 0) as avg_seconds FROM (
         SELECT start_time::date as day,
                SUM(EXTRACT(EPOCH FROM (end_time - start_time))) as daily_seconds
         FROM sleep_sessions
         WHERE user_id = $1 AND start_time >= current_date - interval '7 days'
         GROUP BY start_time::date
       ) sub`,
      [user_id]
    );
    return {
      yesterday_seconds: Number(yesterday.seconds),
      seven_day_average_seconds: Number(weekAvg.avg_seconds),
    };
  });

  app.post("/steps", async (req) => {
    const user_id = req.user_id;
    const { date, count } = req.body as any;
    let [metric] = await query<any>(`SELECT * FROM metrics WHERE user_id = $1 AND name = 'steps'`, [user_id]);
    if (!metric) {
      [metric] = await query<any>(
        `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
         VALUES ($1,'steps','number','steps','walk','teal') RETURNING *`,
        [user_id]
      );
    }
    const rows = await query(
      `INSERT INTO metric_logs (metric_id, value, logged_at)
       VALUES ($1, $2, $3::date)
       ON CONFLICT (metric_id, logged_at) DO UPDATE SET value = EXCLUDED.value
       RETURNING *`,
      [metric.id, count, date]
    );
    return rows[0];
  });
}

