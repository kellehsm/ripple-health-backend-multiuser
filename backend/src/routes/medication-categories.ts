import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function medicationCategoriesRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    return query<any>(
      `SELECT id, label, color_hex, is_default, sort_order
       FROM medication_color_categories WHERE user_id = $1 ORDER BY sort_order, label`,
      [req.user_id]
    );
  });

  app.post("/", async (req) => {
    const { label, color_hex, sort_order } = req.body as any;
    const [row] = await query<any>(
      `INSERT INTO medication_color_categories (user_id, label, color_hex, sort_order)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user_id, label, color_hex, sort_order ?? 0]
    );
    return row;
  });

  app.patch("/:id", async (req) => {
    const { label, color_hex, sort_order } = req.body as any;
    const [row] = await query<any>(
      `UPDATE medication_color_categories
       SET label = COALESCE($1, label), color_hex = COALESCE($2, color_hex),
           sort_order = COALESCE($3, sort_order)
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [label ?? null, color_hex ?? null, sort_order ?? null, (req.params as any).id, req.user_id]
    );
    if (!row) throw { statusCode: 404, message: "Not found" };
    return row;
  });

  app.delete("/:id", async (req) => {
    await query(
      `DELETE FROM medication_color_categories WHERE id = $1 AND user_id = $2`,
      [(req.params as any).id, req.user_id]
    );
    return { ok: true };
  });
}
