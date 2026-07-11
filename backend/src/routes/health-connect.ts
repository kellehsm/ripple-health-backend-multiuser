import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function healthConnectRoutes(app: FastifyInstance) {
  app.post("/heart-rate", async (req) => {
    const { user_id, readings } = req.body as any;
    let inserted = 0;
    for (const r of readings) {
      await query(
        `INSERT INTO heart_rate_readings (user_id, recorded_at, bpm) VALUES ($1,$2,$3)`,
        [user_id, r.recorded_at, r.bpm]
      );
      inserted++;
    }
    return { ok: true, inserted };
  });

  app.post("/sleep", async (req) => {
    const { user_id, sessions } = req.body as any;
    let inserted = 0;
    for (const s of sessions) {
      await query(
        `INSERT INTO sleep_sessions (user_id, start_time, end_time, quality_score) VALUES ($1,$2,$3,$4)`,
        [user_id, s.start_time, s.end_time, s.quality_score ?? null]
      );
      inserted++;
    }
    return { ok: true, inserted };
  });

  app.post("/steps", async (req) => {
    const { user_id, date, count } = req.body as any;
    let [metric] = await query<any>(`SELECT * FROM metrics WHERE user_id = $1 AND name = 'steps'`, [user_id]);
    if (!metric) {
      [metric] = await query<any>(
        `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
         VALUES ($1,'steps','number','steps','walk','teal') RETURNING *`,
        [user_id]
      );
    }
    const rows = await query(
      `INSERT INTO metric_logs (metric_id, value, logged_at) VALUES ($1,$2,$3) RETURNING *`,
      [metric.id, count, date]
    );
    return rows[0];
  });
}

