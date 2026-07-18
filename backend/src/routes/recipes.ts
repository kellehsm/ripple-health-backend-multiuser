import { FastifyInstance } from "fastify";
import { query } from "../db.js";

const COLS = "id, name, carbs_g::float, sugar_g::float, calories::float, ingredients, created_at, updated_at";

export default async function recipesRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    return query(`SELECT ${COLS} FROM recipes WHERE user_id = $1 ORDER BY updated_at DESC`, [req.user_id]);
  });

  app.post("/", async (req) => {
    const { name, carbs_g, sugar_g, calories, ingredients } = req.body as any;
    const rows = await query(
      `INSERT INTO recipes (user_id, name, carbs_g, sugar_g, calories, ingredients)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING ${COLS}`,
      [req.user_id, name, carbs_g ?? null, sugar_g ?? null, calories ?? null,
       JSON.stringify(ingredients ?? [])]
    );
    return rows[0];
  });

  app.patch("/:id", async (req, reply) => {
    const { id } = req.params as any;
    const { name, carbs_g, sugar_g, calories, ingredients } = req.body as any;
    const rows = await query(
      `UPDATE recipes SET
         name        = COALESCE($2, name),
         carbs_g     = COALESCE($3, carbs_g),
         sugar_g     = COALESCE($4, sugar_g),
         calories    = COALESCE($5, calories),
         ingredients = COALESCE($6::jsonb, ingredients),
         updated_at  = now()
       WHERE id = $1 AND user_id = $7
       RETURNING ${COLS}`,
      [id, name ?? null, carbs_g ?? null, sugar_g ?? null, calories ?? null,
       ingredients !== undefined ? JSON.stringify(ingredients) : null, req.user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: "not found" });
    return rows[0];
  });

  app.delete("/:id", async (req, reply) => {
    const rows = await query(
      `DELETE FROM recipes WHERE id = $1 AND user_id = $2 RETURNING id`,
      [(req.params as any).id, req.user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: "not found" });
    return { ok: true };
  });
}
