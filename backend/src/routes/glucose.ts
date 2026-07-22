import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { syncDexcomShareGlucose } from "../jobs/dexcom-share-sync.js";

export default async function glucoseRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const { date, start, end } = req.query as any;

    if (start && end) {
      return query(
        `SELECT * FROM glucose_readings WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3 ORDER BY recorded_at`,
        [user_id, start, end]
      );
    }
    if (date) {
      return query(
        `SELECT * FROM glucose_readings WHERE user_id = $1 AND recorded_at::date = $2 ORDER BY recorded_at`,
        [user_id, date]
      );
    }
    return query(
      `SELECT * FROM glucose_readings WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 288`,
      [user_id]
    );
  });

  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { recorded_at, mg_dl, trend } = req.body as any;
    const rows = await query(
      `INSERT INTO glucose_readings (user_id, recorded_at, mg_dl, trend)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [user_id, recorded_at, mg_dl, trend]
    );
    return rows[0];
  });

  app.get("/tir", async (req) => {
    const user_id = req.user_id;
    const { date } = req.query as any;
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    const rows = await query<{ in_range: string; total: string }>(
      `SELECT
        COUNT(*) FILTER (WHERE mg_dl BETWEEN 70 AND 180) AS in_range,
        COUNT(*) AS total
       FROM glucose_readings
       WHERE user_id = $1
         AND recorded_at >= ($2::date)
         AND recorded_at < ($2::date + INTERVAL '1 day')`,
      [user_id, targetDate]
    );
    const in_range = Number(rows[0]?.in_range ?? 0);
    const total = Number(rows[0]?.total ?? 0);
    if (total === 0) {
      return { tir_percent: null, in_range: 0, total: 0, date: targetDate };
    }
    return {
      tir_percent: Math.round((in_range / total) * 100),
      in_range,
      total,
      date: targetDate,
    };
  });

  app.post("/sync-share", async (req) => {
    return syncDexcomShareGlucose(req.user_id);
  });
}
