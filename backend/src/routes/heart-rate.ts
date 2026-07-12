import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function heartRateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { user_id, start, end } = req.query as any;
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
}
