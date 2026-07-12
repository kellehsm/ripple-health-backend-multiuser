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
