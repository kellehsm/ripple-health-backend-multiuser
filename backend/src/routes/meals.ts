import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function mealsRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { user_id, date } = req.query as any;
    const cols = `id, user_id, name, meal_type, source_db, source_food_id, logged_at,
      carbs_g::float AS carbs_g, sugar_g::float AS sugar_g, calories::float AS calories`;
    if (date) {
      return query(
        `SELECT ${cols} FROM meals WHERE user_id = $1 AND logged_at::date = $2 ORDER BY logged_at`,
        [user_id, date]
      );
    }
    return query(`SELECT ${cols} FROM meals WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50`, [user_id]);
  });

  // Quick-add a meal. carbs/sugar/calories are optional - fill in later
  // from a USDA FoodData Central or Open Food Facts lookup.
  app.post("/", async (req) => {
    const { user_id, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id, logged_at, context } = req.body as any;
    const rows = await query(
      `INSERT INTO meals (user_id, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id, context, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, COALESCE($10, now()))
       RETURNING id, user_id, name, meal_type, source_db, source_food_id, context, logged_at,
         carbs_g::float AS carbs_g, sugar_g::float AS sugar_g, calories::float AS calories`,
      [user_id, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id,
       context ? JSON.stringify(context) : null, logged_at]
    );
    return rows[0];
  });

  app.patch("/:id", async (req) => {
    const { id } = req.params as any;
    const { name, meal_type, carbs_g, sugar_g, calories, context } = req.body as any;
    const rows = await query(
      `UPDATE meals SET
         name      = COALESCE($2, name),
         meal_type = COALESCE($3, meal_type),
         carbs_g   = COALESCE($4, carbs_g),
         sugar_g   = COALESCE($5, sugar_g),
         calories  = COALESCE($6, calories),
         context   = CASE WHEN $7::jsonb IS NOT NULL THEN $7::jsonb ELSE context END
       WHERE id = $1
       RETURNING id, user_id, name, meal_type, source_db, source_food_id, context, logged_at,
         carbs_g::float AS carbs_g, sugar_g::float AS sugar_g, calories::float AS calories`,
      [id, name, meal_type, carbs_g, sugar_g, calories,
       context ? JSON.stringify(context) : null]
    );
    return rows[0];
  });

  app.delete("/:mealId", async (req) => {
    const { mealId } = req.params as any;
    await query(`DELETE FROM meals WHERE id = $1`, [mealId]);
    return { ok: true };
  });

  // Top 8 most-frequently logged meals, computed on the fly from history.
  // Registered before /:mealId routes to avoid Fastify treating "frequent" as a param.
  app.get("/frequent", async (req) => {
    const { user_id } = req.query as any;
    return query(
      `SELECT
         name,
         source_food_id,
         source_db,
         ROUND(AVG(carbs_g)::numeric, 1)::float AS carbs_g,
         ROUND(AVG(sugar_g)::numeric, 1)::float AS sugar_g,
         ROUND(AVG(calories)::numeric, 0)::float AS calories,
         COUNT(*)::int AS frequency
       FROM meals
       WHERE user_id = $1
       GROUP BY name, source_food_id, source_db
       ORDER BY frequency DESC
       LIMIT 8`,
      [user_id]
    );
  });

  // Glucose response window for one meal - the core correlation query.
  app.get("/:mealId/glucose-response", async (req) => {
    const { mealId } = req.params as any;
    const [meal] = await query(`SELECT * FROM meals WHERE id = $1`, [mealId]);
    if (!meal) return { error: "meal not found" };
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
