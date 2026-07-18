import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function searchRoutes(app: FastifyInstance) {
  app.get("/glucose", async (req) => {
    const user_id = req.user_id;
    const { threshold, bucket, start, end } = req.query as any;
    // threshold=0 means "all days" (no HAVING filter); default is 180 for "high days" search
    const threshRaw = threshold !== undefined ? parseInt(threshold, 10) : 180;
    const thresh = isNaN(threshRaw) ? 180 : Math.max(0, Math.min(400, threshRaw));
    const applyThreshold = thresh > 0;

    const bucketFilter = bucket
      ? `AND (
          CASE
            WHEN EXTRACT(HOUR FROM recorded_at) >= 5 AND EXTRACT(HOUR FROM recorded_at) < 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM recorded_at) >= 11 AND EXTRACT(HOUR FROM recorded_at) < 16 THEN 'afternoon'
            WHEN EXTRACT(HOUR FROM recorded_at) >= 16 AND EXTRACT(HOUR FROM recorded_at) < 21 THEN 'evening'
            ELSE 'night'
          END
        ) = $4`
      : "";

    const params: any[] = [user_id, start || "2000-01-01", end || new Date().toISOString()];
    if (bucket) params.push(bucket);
    if (applyThreshold) params.push(thresh);

    const rows = await query<any>(
      `SELECT recorded_at::date AS date,
              ROUND(AVG(mg_dl)) AS avg_mg_dl,
              MAX(mg_dl) AS max_mg_dl,
              COUNT(*) AS reading_count
       FROM glucose_readings
       WHERE user_id = $1
         AND recorded_at >= $2
         AND recorded_at <= $3
         ${bucketFilter}
       GROUP BY recorded_at::date
       ${applyThreshold ? `HAVING AVG(mg_dl) > $${params.length}` : ""}
       ORDER BY recorded_at::date DESC
       LIMIT 60`,
      params
    );

    return rows.map((r: any) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      avg_mg_dl: Number(r.avg_mg_dl),
      max_mg_dl: Number(r.max_mg_dl),
      reading_count: Number(r.reading_count),
    }));
  });

  app.get("/meals", async (req) => {
    const user_id = req.user_id;
    const { q, min_carbs, start, end } = req.query as any;
    const params: any[] = [user_id, start || "2000-01-01", end || new Date().toISOString()];
    const conditions: string[] = ["user_id = $1", "logged_at >= $2", "logged_at <= $3"];

    if (q) { params.push("%" + q + "%"); conditions.push("name ILIKE $" + params.length); }
    if (min_carbs) { params.push(parseFloat(min_carbs)); conditions.push("carbs_g >= $" + params.length); }

    return query(
      `SELECT id, logged_at, name, meal_type, carbs_g::float, calories::float
       FROM meals WHERE ${conditions.join(" AND ")}
       ORDER BY logged_at DESC LIMIT 60`,
      params
    );
  });

  app.get("/mood", async (req) => {
    const user_id = req.user_id;
    const { min_score, max_score, start, end } = req.query as any;
    const params: any[] = [user_id, start || "2000-01-01", end || new Date().toISOString()];
    const conditions: string[] = ["user_id = $1", "logged_at >= $2", "logged_at <= $3", "entry_type != 'moment'"];

    if (min_score) { params.push(parseInt(min_score, 10)); conditions.push("mood_score >= $" + params.length); }
    if (max_score) { params.push(parseInt(max_score, 10)); conditions.push("mood_score <= $" + params.length); }

    return query(
      `SELECT id, logged_at, mood_score, mood_label, period, entry_text
       FROM journal_entries WHERE ${conditions.join(" AND ")}
       ORDER BY logged_at DESC LIMIT 60`,
      params
    );
  });

  app.get("/spending", async (req) => {
    const user_id = req.user_id;
    const { min_amount, category, start, end } = req.query as any;
    const params: any[] = [user_id, start || "2000-01-01", end || new Date().toISOString()];
    const conditions: string[] = ["user_id = $1", "logged_at >= $2", "logged_at <= $3"];

    if (min_amount) { params.push(parseFloat(min_amount)); conditions.push("amount >= $" + params.length); }
    if (category) { params.push("%" + category + "%"); conditions.push("category ILIKE $" + params.length); }

    return query(
      `SELECT id, logged_at, amount::float, category, note
       FROM spending_entries WHERE ${conditions.join(" AND ")}
       ORDER BY logged_at DESC LIMIT 60`,
      params
    );
  });

  // ── Global search ──────────────────────────────────────────────────────────
  // Single query across meals, journal entries, books, and hobbies. Returns
  // results grouped by type, max 20 per type.

  app.get("/global", async (req) => {
    const user_id = req.user_id;
    const { q } = req.query as any;
    if (!q || String(q).trim().length < 2) return { meals: [], mood: [], journal: [], books: [], hobbies: [] };

    const term = "%" + String(q).trim() + "%";

    const [meals, mood, journal, books, hobbies] = await Promise.all([
      query<any>(
        `SELECT id, logged_at, name, meal_type, carbs_g::float, calories::float
         FROM meals WHERE user_id = $1 AND name ILIKE $2
         ORDER BY logged_at DESC LIMIT 20`,
        [user_id, term]
      ),
      query<any>(
        `SELECT id, logged_at, mood_score, mood_label, period, entry_text
         FROM journal_entries
         WHERE user_id = $1 AND entry_type != 'moment'
           AND (mood_label ILIKE $2 OR entry_text ILIKE $2)
         ORDER BY logged_at DESC LIMIT 20`,
        [user_id, term]
      ),
      query<any>(
        `SELECT id, logged_at, mood_score, entry_text, entry_type
         FROM journal_entries
         WHERE user_id = $1 AND entry_type = 'moment' AND entry_text ILIKE $2
         ORDER BY logged_at DESC LIMIT 20`,
        [user_id, term]
      ),
      query<any>(
        `SELECT id, title, author, status, total_pages
         FROM books WHERE user_id = $1 AND (title ILIKE $2 OR author ILIKE $2)
         ORDER BY started_at DESC NULLS LAST LIMIT 20`,
        [user_id, term]
      ),
      query<any>(
        `SELECT id, name, status
         FROM hobbies WHERE user_id = $1 AND name ILIKE $2
         ORDER BY id DESC LIMIT 20`,
        [user_id, term]
      ),
    ]);

    return { meals, mood, journal, books, hobbies };
  });
}
