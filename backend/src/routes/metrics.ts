import { FastifyInstance } from "fastify";
import { query } from "../db.js";

// Generic metric engine: water, screen time, meds, workouts, etc.
export default async function metricsRoutes(app: FastifyInstance) {
  // List metric types; supports ?user_id= and/or ?name= filters
  app.get("/", async (req) => {
    const { user_id, name } = req.query as any;
    const conditions: string[] = [];
    const params: any[] = [];
    if (user_id) { params.push(user_id); conditions.push("user_id = $" + params.length); }
    if (name) { params.push(name); conditions.push("name = $" + params.length); }
    const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
    return query("SELECT * FROM metrics" + where + " ORDER BY name", params);
  });

  // Create a new metric type (e.g. adding "meditation" later)
  app.post("/", async (req) => {
    const { user_id, name, value_type, unit, icon, color_key } = req.body as any;
    const rows = await query(
      `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [user_id, name, value_type, unit, icon, color_key]
    );
    return rows[0];
  });

  // Log a value for a metric (e.g. "8 glasses of water")
  app.post("/:metricId/logs", async (req) => {
    const { metricId } = req.params as any;
    const { value, note, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO metric_logs (metric_id, value, note, logged_at)
       VALUES ($1,$2,$3, COALESCE($4, now())) RETURNING *`,
      [metricId, value, note, logged_at]
    );
    return rows[0];
  });

  // Get recent logs for one metric
  app.get("/:metricId/logs", async (req) => {
    const { metricId } = req.params as any;
    return query(
      `SELECT * FROM metric_logs WHERE metric_id = $1 ORDER BY logged_at DESC LIMIT 100`,
      [metricId]
    );
  });

  // Yesterday total + 7-day average
  app.get("/:metricId/stats", async (req) => {
    const { metricId } = req.params as any;
    const [yesterday] = await query<any>(
      `SELECT COALESCE(SUM(value), 0) as total FROM metric_logs
       WHERE metric_id = $1 AND logged_at::date = current_date - interval '1 day'`,
      [metricId]
    );
    const [weekAvg] = await query<any>(
      `SELECT COALESCE(AVG(daily_total), 0) as avg FROM (
         SELECT logged_at::date as day, SUM(value) as daily_total
         FROM metric_logs
         WHERE metric_id = $1 AND logged_at >= current_date - interval '7 days'
         GROUP BY logged_at::date
       ) sub`,
      [metricId]
    );
    return { yesterday_total: Number(yesterday.total), seven_day_average: Number(weekAvg.avg) };
  });

  // Per-day totals for the current week, respecting week_start_day.
  // agg=max (default) is correct for step counts (cumulative syncs); agg=sum for water/discrete logs.
  // Returns only days from week-start through today — no future-day placeholders.
  app.get("/:metricId/daily-breakdown", async (req) => {
    const { metricId } = req.params as any;
    const { week_start_day = "1", agg = "max" } = req.query as any;
    const startDay = Math.max(0, Math.min(6, parseInt(week_start_day, 10) || 1));
    const aggFn = agg === "sum" ? "SUM" : "MAX";

    // Identical week-start formula used by weekly-total so dates always agree
    const [ws] = await query<any>(
      `SELECT (date_trunc('day', now()) - ((EXTRACT(DOW FROM now())::int - $1 + 7) % 7) * INTERVAL '1 day')::date AS week_start`,
      [startDay]
    );

    const rows = await query<any>(
      `SELECT
         d::date AS date,
         TRIM(TO_CHAR(d, 'Dy')) AS day_label,
         COALESCE(
           (SELECT ${aggFn}(value) FROM metric_logs WHERE metric_id = $1 AND logged_at::date = d::date),
           0
         ) AS total,
         (d::date = current_date) AS is_today
       FROM generate_series($2::date, current_date, INTERVAL '1 day') AS d
       ORDER BY d`,
      [metricId, ws.week_start]
    );

    const [lastWeekRow] = await query<any>(
      `SELECT COALESCE(SUM(day_val), 0) AS total FROM (
         SELECT logged_at::date, ${aggFn}(value) AS day_val
         FROM metric_logs
         WHERE metric_id = $1
           AND logged_at::date >= $2::date - 7
           AND logged_at::date < $2::date
         GROUP BY logged_at::date
       ) t`,
      [metricId, ws.week_start]
    );

    return {
      days: rows.map((r: any) => ({
        date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
        day_label: String(r.day_label),
        total: Number(r.total),
        is_today: r.is_today === true || r.is_today === "t",
      })),
      last_week_total: Number(lastWeekRow.total),
    };
  });

  // Weekly total, respecting a configurable week-start day (0=Sun, 1=Mon default)
  app.get("/:metricId/weekly-total", async (req) => {
    const { metricId } = req.params as any;
    const { week_start_day = "1" } = req.query as any;
    const startDay = Math.max(0, Math.min(6, parseInt(week_start_day, 10) || 1));
    const [result] = await query<any>(
      `SELECT COALESCE(SUM(value), 0) as total FROM metric_logs
       WHERE metric_id = $1
         AND logged_at >= date_trunc('day', now()) -
           ((EXTRACT(DOW FROM now())::int - $2 + 7) % 7) * INTERVAL '1 day'`,
      [metricId, startDay]
    );
    return { week_total: Number(result.total) };
  });
}
