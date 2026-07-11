import { FastifyInstance } from "fastify";
import { query } from "../db.js";

// Generic metric engine: water, screen time, meds, workouts, etc.
export default async function metricsRoutes(app: FastifyInstance) {
  // List all defined metric types (e.g. "water", "screen_time")
  app.get("/", async () => {
    return query("SELECT * FROM metrics ORDER BY name");
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
}
