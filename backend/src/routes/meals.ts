import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function mealsRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { user_id, date } = req.query as any;
    if (date) {
      return query(
        `SELECT * FROM meals WHERE user_id = $1 AND logged_at::date = $2 ORDER BY logged_at`,
        [user_id, date]
      );
    }
    return query(`SELECT * FROM meals WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 50`, [user_id]);
  });

  // Quick-add a meal. carbs/sugar/calories are optional - fill in later
  // from a USDA FoodData Central or Open Food Facts lookup.
  app.post("/", async (req) => {
    const { user_id, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO meals (user_id, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, now())) RETURNING *`,
      [user_id, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id, logged_at]
    );
    return rows[0];
  });

  app.patch("/:id", async (req) => {
    const { id } = req.params as any;
    const { name, meal_type, carbs_g, sugar_g, calories } = req.body as any;
    const rows = await query(
      `UPDATE meals SET
         name = COALESCE($2, name),
         meal_type = COALESCE($3, meal_type),
         carbs_g = COALESCE($4, carbs_g),
         sugar_g = COALESCE($5, sugar_g),
         calories = COALESCE($6, calories)
       WHERE id = $1 RETURNING *`,
      [id, name, meal_type, carbs_g, sugar_g, calories]
    );
    return rows[0];
  });

  app.delete("/:mealId", async (req) => {
    const { mealId } = req.params as any;
    await query(`DELETE FROM meals WHERE id = $1`, [mealId]);
    return { ok: true };
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
