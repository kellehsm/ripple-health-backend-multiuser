import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { syncDexcomShareGlucose } from "../jobs/dexcom-share-sync.js";

export default async function glucoseRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { user_id, date, start, end } = req.query as any;

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
    const { user_id, recorded_at, mg_dl, trend } = req.body as any;
    const rows = await query(
      `INSERT INTO glucose_readings (user_id, recorded_at, mg_dl, trend)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [user_id, recorded_at, mg_dl, trend]
    );
    return rows[0];
  });

  app.post("/sync-share", async (req) => {
    const { user_id } = req.body as any;
    return syncDexcomShareGlucose(user_id);
  });
}
