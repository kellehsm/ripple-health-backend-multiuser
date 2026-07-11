import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function summaryRoutes(app: FastifyInstance) {
  // Powers the Overview tab's top stat row.
  app.get("/today", async (req) => {
    const { user_id } = req.query as any;
    const rows = await query(
      `SELECT * FROM daily_summary WHERE user_id = $1 AND date = current_date`,
      [user_id]
    );
    return rows[0] ?? { user_id, date: new Date().toISOString().slice(0, 10) };
  });

  // Powers the "Today's pattern" timeline: mood + spending + meals + glucose
  // spikes merged into one time-ordered list of events.
  app.get("/pattern", async (req) => {
    const { user_id, date } = req.query as any;
    const day = date ?? new Date().toISOString().slice(0, 10);

    const [mood, spend, meals, glucoseSpikes] = await Promise.all([
      query(
        `SELECT logged_at AS time, 'mood' AS type, mood_score::text AS label
         FROM journal_entries WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
      query(
        `SELECT logged_at AS time, 'spend' AS type, ('$' || amount || ' ' || COALESCE(category,'')) AS label
         FROM spending_entries WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
      query(
        `SELECT logged_at AS time, 'meal' AS type, name AS label
         FROM meals WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
      // simplistic "spike" = local max above 140 mg/dL
      query(
        `SELECT recorded_at AS time, 'glucose_spike' AS type, (mg_dl || ' mg/dL') AS label
         FROM glucose_readings
         WHERE user_id = $1 AND recorded_at::date = $2 AND mg_dl > 140`,
        [user_id, day]
      ),
    ]);

    const events = [...mood, ...spend, ...meals, ...glucoseSpikes].sort(
      (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    return events;
  });
}
