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

  // Watch backfills send tens of thousands of HR samples in one batch; the
  // Fastify default 1 MiB body limit was rejecting them with 413s (silent HR
  // data loss in prod). 10 MiB ≈ 170k readings of headroom.
  app.post("/heart-rate", { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const user_id = req.user_id;
    const { readings } = req.body as any;
    if (!Array.isArray(readings) || readings.length === 0) return { ok: true, inserted: 0 };
    // Filter out malformed rows before they reach the DB (NaN, missing fields).
    const valid = readings.filter(
      (r: any) => r && typeof r.recorded_at === "string" && Number.isFinite(Number(r.bpm))
    );
    if (valid.length === 0) return { ok: true, inserted: 0 };
    await query(
      `INSERT INTO heart_rate_readings (user_id, recorded_at, bpm)
       SELECT $1::uuid, unnest($2::timestamptz[]), unnest($3::int[])
       ON CONFLICT (user_id, recorded_at) DO NOTHING`,
      [user_id, valid.map((r: any) => r.recorded_at), valid.map((r: any) => Math.round(Number(r.bpm)))]
    );
    return { ok: true, inserted: valid.length };
  });

  app.post("/sleep", async (req) => {
    const user_id = req.user_id;
    const { sessions } = req.body as any;
    if (!sessions?.length) return { ok: true, inserted: 0 };
    // ON CONFLICT UPDATE — stages may arrive after the session was first
    // written (older sync path was start/end-only), so keep the newer stage
    // numbers if they show up.
    await query(
      `INSERT INTO sleep_sessions
         (user_id, start_time, end_time, quality_score, deep_ms, rem_ms, light_ms, awake_ms)
       SELECT $1::uuid,
              unnest($2::timestamptz[]),
              unnest($3::timestamptz[]),
              unnest($4::float8[]),
              unnest($5::bigint[]),
              unnest($6::bigint[]),
              unnest($7::bigint[]),
              unnest($8::bigint[])
       ON CONFLICT (user_id, start_time) DO UPDATE SET
         end_time      = EXCLUDED.end_time,
         quality_score = COALESCE(EXCLUDED.quality_score, sleep_sessions.quality_score),
         deep_ms       = COALESCE(EXCLUDED.deep_ms,  sleep_sessions.deep_ms),
         rem_ms        = COALESCE(EXCLUDED.rem_ms,   sleep_sessions.rem_ms),
         light_ms      = COALESCE(EXCLUDED.light_ms, sleep_sessions.light_ms),
         awake_ms      = COALESCE(EXCLUDED.awake_ms, sleep_sessions.awake_ms)`,
      [
        user_id,
        sessions.map((s: any) => s.start_time),
        sessions.map((s: any) => s.end_time),
        sessions.map((s: any) => s.quality_score ?? null),
        sessions.map((s: any) => s.deep_ms  ?? null),
        sessions.map((s: any) => s.rem_ms   ?? null),
        sessions.map((s: any) => s.light_ms ?? null),
        sessions.map((s: any) => s.awake_ms ?? null),
      ]
    );
    return { ok: true, inserted: sessions.length };
  });

  // Sessions in a rolling range — powers the sleep detail screen.
  app.get("/sleep/range", async (req) => {
    const user_id = req.user_id;
    const { start, end } = req.query as any;
    if (!start || !end) return { sessions: [] };
    const rows = await query<any>(
      `SELECT id, start_time, end_time, quality_score,
              deep_ms, rem_ms, light_ms, awake_ms
       FROM sleep_sessions
       WHERE user_id = $1 AND start_time >= $2::timestamptz AND start_time < $3::timestamptz
       ORDER BY start_time ASC`,
      [user_id, start, end]
    );
    return {
      sessions: rows.map((r: any) => ({
        id: r.id,
        start_time: r.start_time,
        end_time:   r.end_time,
        quality_score: r.quality_score,
        deep_ms:  r.deep_ms  != null ? Number(r.deep_ms)  : null,
        rem_ms:   r.rem_ms   != null ? Number(r.rem_ms)   : null,
        light_ms: r.light_ms != null ? Number(r.light_ms) : null,
        awake_ms: r.awake_ms != null ? Number(r.awake_ms) : null,
      })),
    };
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
    const weekDays = await query<any>(
      `SELECT start_time::date AS day,
              SUM(EXTRACT(EPOCH FROM (end_time - start_time))) AS seconds
       FROM sleep_sessions
       WHERE user_id = $1 AND start_time >= current_date - interval '6 days'
       GROUP BY start_time::date
       ORDER BY start_time::date ASC`,
      [user_id]
    );
    // 30-day stage averages + median bedtime / wake time (whichever is available).
    const [stageAvg] = await query<any>(
      `SELECT
         AVG(NULLIF(deep_ms,  0))::bigint AS avg_deep_ms,
         AVG(NULLIF(rem_ms,   0))::bigint AS avg_rem_ms,
         AVG(NULLIF(light_ms, 0))::bigint AS avg_light_ms,
         AVG(NULLIF(awake_ms, 0))::bigint AS avg_awake_ms,
         COUNT(*) FILTER (WHERE deep_ms IS NOT NULL OR rem_ms IS NOT NULL OR light_ms IS NOT NULL) AS staged_count
       FROM sleep_sessions
       WHERE user_id = $1 AND start_time >= current_date - interval '30 days'`,
      [user_id]
    );
    const [times] = await query<any>(
      `SELECT
         PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(HOUR FROM start_time) * 60 + EXTRACT(MINUTE FROM start_time)
         ) AS median_bedtime_mins,
         PERCENTILE_CONT(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(HOUR FROM end_time)   * 60 + EXTRACT(MINUTE FROM end_time)
         ) AS median_waketime_mins
       FROM sleep_sessions
       WHERE user_id = $1 AND start_time >= current_date - interval '30 days'`,
      [user_id]
    );
    return {
      yesterday_seconds: Number(yesterday.seconds),
      seven_day_average_seconds: Number(weekAvg.avg_seconds),
      week_days: weekDays.map((r: any) => ({ date: String(r.day).slice(0, 10), seconds: Number(r.seconds) })),
      stages_30d: stageAvg.staged_count > 0 ? {
        avg_deep_ms:  stageAvg.avg_deep_ms  != null ? Number(stageAvg.avg_deep_ms)  : null,
        avg_rem_ms:   stageAvg.avg_rem_ms   != null ? Number(stageAvg.avg_rem_ms)   : null,
        avg_light_ms: stageAvg.avg_light_ms != null ? Number(stageAvg.avg_light_ms) : null,
        avg_awake_ms: stageAvg.avg_awake_ms != null ? Number(stageAvg.avg_awake_ms) : null,
        sample_count: Number(stageAvg.staged_count),
      } : null,
      schedule_30d: {
        median_bedtime_mins:  times.median_bedtime_mins  != null ? Number(times.median_bedtime_mins)  : null,
        median_waketime_mins: times.median_waketime_mins != null ? Number(times.median_waketime_mins) : null,
      },
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

