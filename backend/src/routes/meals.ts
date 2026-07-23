import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function mealsRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const { date } = req.query as any;
    const cols = `id, user_id, name, meal_type, source_db, source_food_id, logged_at,
      carbs_g::float AS carbs_g, sugar_g::float AS sugar_g, calories::float AS calories,
      caffeine_mg::float AS caffeine_mg, sodium_mg::float AS sodium_mg`;
    if (date) {
      return query(
        `SELECT ${cols} FROM meals WHERE user_id = $1 AND logged_at::date = $2 ORDER BY logged_at`,
        [user_id, date]
      );
    }
    return query(`SELECT ${cols} FROM meals WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50`, [user_id]);
  });

  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { name, meal_type, carbs_g, sugar_g, calories, caffeine_mg, sodium_mg, source_db, source_food_id, logged_at, context } = req.body as any;
    const rows = await query(
      `INSERT INTO meals (user_id, name, meal_type, carbs_g, sugar_g, calories, caffeine_mg, sodium_mg, source_db, source_food_id, context, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb, COALESCE($12, now()))
       RETURNING id, user_id, name, meal_type, source_db, source_food_id, context, logged_at,
         carbs_g::float AS carbs_g, sugar_g::float AS sugar_g, calories::float AS calories,
         caffeine_mg::float AS caffeine_mg, sodium_mg::float AS sodium_mg`,
      [user_id, name, meal_type, carbs_g, sugar_g, calories, caffeine_mg ?? null, sodium_mg ?? null,
       source_db, source_food_id, context ? JSON.stringify(context) : null, logged_at]
    );
    return rows[0];
  });

  app.patch("/:id", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const { name, meal_type, carbs_g, sugar_g, calories, caffeine_mg, sodium_mg, context } = req.body as any;
    const rows = await query(
      `UPDATE meals SET
         name        = COALESCE($2, name),
         meal_type   = COALESCE($3, meal_type),
         carbs_g     = COALESCE($4, carbs_g),
         sugar_g     = COALESCE($5, sugar_g),
         calories    = COALESCE($6, calories),
         caffeine_mg = COALESCE($7, caffeine_mg),
         sodium_mg   = COALESCE($8, sodium_mg),
         context     = CASE WHEN $9::jsonb IS NOT NULL THEN $9::jsonb ELSE context END
       WHERE id = $1 AND user_id = $10
       RETURNING id, user_id, name, meal_type, source_db, source_food_id, context, logged_at,
         carbs_g::float AS carbs_g, sugar_g::float AS sugar_g, calories::float AS calories,
         caffeine_mg::float AS caffeine_mg, sodium_mg::float AS sodium_mg`,
      [id, name, meal_type, carbs_g, sugar_g, calories, caffeine_mg ?? null, sodium_mg ?? null,
       context ? JSON.stringify(context) : null, user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: "not found" });
    return rows[0];
  });

  app.delete("/:mealId", async (req, reply) => {
    const user_id = req.user_id;
    const { mealId } = req.params as any;
    const rows = await query(
      `DELETE FROM meals WHERE id = $1 AND user_id = $2 RETURNING id`,
      [mealId, user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: "not found" });
    return { ok: true };
  });

  app.get("/impact-scores", async (req) => {
    const user_id = req.user_id;
    const rows = await query(
      `WITH meal_windows AS (
        SELECT
          m.name,
          m.logged_at,
          (SELECT g.mg_dl FROM glucose_readings g
           WHERE g.user_id = m.user_id
             AND g.recorded_at BETWEEN m.logged_at - INTERVAL '30 min' AND m.logged_at
           ORDER BY g.recorded_at DESC LIMIT 1) AS pre_glucose,
          (SELECT MAX(g.mg_dl) FROM glucose_readings g
           WHERE g.user_id = m.user_id
             AND g.recorded_at BETWEEN m.logged_at + INTERVAL '45 min' AND m.logged_at + INTERVAL '105 min'
          ) AS post_glucose
        FROM meals m
        WHERE m.user_id = $1 AND m.logged_at IS NOT NULL
      ),
      scored AS (
        SELECT name, (post_glucose - pre_glucose) AS spike
        FROM meal_windows
        WHERE pre_glucose IS NOT NULL AND post_glucose IS NOT NULL
          AND (post_glucose - pre_glucose) >= -10
      )
      SELECT name AS meal_name, ROUND(AVG(spike))::int AS avg_spike, COUNT(*)::int AS sample_count
      FROM scored
      GROUP BY name
      HAVING COUNT(*) >= 2
      ORDER BY AVG(spike) DESC`,
      [user_id]
    );
    return { scores: rows };
  });

  app.get("/frequent", async (req) => {
    const user_id = req.user_id;
    return query(
      `SELECT
         name,
         source_food_id,
         source_db,
         ROUND(AVG(carbs_g)::numeric, 1)::float AS carbs_g,
         ROUND(AVG(sugar_g)::numeric, 1)::float AS sugar_g,
         ROUND(AVG(calories)::numeric, 0)::float AS calories,
         ROUND(AVG(caffeine_mg)::numeric, 1)::float AS caffeine_mg,
         ROUND(AVG(sodium_mg)::numeric, 1)::float AS sodium_mg,
         COUNT(*)::int AS frequency
       FROM meals
       WHERE user_id = $1
       GROUP BY name, source_food_id, source_db
       ORDER BY frequency DESC
       LIMIT 8`,
      [user_id]
    );
  });

  app.get("/:mealId/glucose-response", async (req, reply) => {
    const user_id = req.user_id;
    const { mealId } = req.params as any;
    const [meal] = await query(`SELECT * FROM meals WHERE id = $1 AND user_id = $2`, [mealId, user_id]);
    if (!meal) return reply.status(404).send({ error: "not found" });
    return query(
      `SELECT * FROM glucose_readings
       WHERE user_id = $1
         AND recorded_at BETWEEN $2::timestamptz - interval '15 minutes'
                              AND $2::timestamptz + interval '3 hours'
       ORDER BY recorded_at`,
      [(meal as any).user_id, (meal as any).logged_at]
    );
  });
}
