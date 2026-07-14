import { FastifyInstance } from "fastify";
import { query } from "../db.js";

// Generalized version of the "books" pattern - works for any hobby.
export default async function hobbiesRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { user_id } = req.query as any;
    return query(`SELECT * FROM hobbies WHERE user_id = $1 ORDER BY name`, [user_id]);
  });

  app.post("/", async (req) => {
    const { user_id, name, unit_label, icon, color_key } = req.body as any;
    const rows = await query(
      `INSERT INTO hobbies (user_id, name, unit_label, icon, color_key)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [user_id, name, unit_label, icon, color_key]
    );
    return rows[0];
  });

  app.post("/:hobbyId/logs", async (req) => {
    const { hobbyId } = req.params as any;
    const { amount, rating, note, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO hobby_logs (hobby_id, amount, rating, note, logged_at)
       VALUES ($1,$2,$3,$4, COALESCE($5, now())) RETURNING *`,
      [hobbyId, amount, rating, note, logged_at]
    );
    return rows[0];
  });

  app.get("/:hobbyId/logs", async (req) => {
    const { hobbyId } = req.params as any;
    return query(`SELECT * FROM hobby_logs WHERE hobby_id = $1 ORDER BY logged_at DESC LIMIT 100`, [hobbyId]);
  });

  app.delete("/:id", async (req) => {
    const { id } = req.params as any;
    await query(`DELETE FROM hobby_logs WHERE hobby_id = $1`, [id]);
    await query(`DELETE FROM hobbies WHERE id = $1`, [id]);
    return { ok: true };
  });

  app.get("/:id/stats", async (req) => {
    const { id } = req.params as any;
    const { week_start_day = "1" } = req.query as any;
    const parsed = parseInt(week_start_day, 10);
    const startDay = Math.max(0, Math.min(6, isNaN(parsed) ? 1 : parsed));

    const [ws] = await query<any>(
      `SELECT (date_trunc('day', now()) - ((EXTRACT(DOW FROM now())::int - $1 + 7) % 7) * INTERVAL '1 day')::date AS week_start`,
      [startDay]
    );
    const weekStart = ws.week_start instanceof Date ? ws.week_start.toISOString().slice(0, 10) : String(ws.week_start).slice(0, 10);

    const [thisWeek] = await query<any>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM hobby_logs
       WHERE hobby_id = $1 AND logged_at::date >= $2::date`,
      [id, weekStart]
    );
    const [lastWeek] = await query<any>(
      `SELECT COALESCE(SUM(amount), 0) as total FROM hobby_logs
       WHERE hobby_id = $1
         AND logged_at::date >= $2::date - INTERVAL '7 days'
         AND logged_at::date < $2::date`,
      [id, weekStart]
    );
    return {
      this_week_total: Number(thisWeek.total),
      last_week_total: Number(lastWeek.total),
      change: Number(thisWeek.total) - Number(lastWeek.total),
    };
  });
}
