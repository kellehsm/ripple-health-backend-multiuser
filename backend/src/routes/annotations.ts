import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function annotationsRoutes(app: FastifyInstance) {
  // GET /api/annotations?start=ISO&end=ISO
  app.get("/", async (req, reply) => {
    const userId = (req as any).user_id;
    const { start, end } = req.query as any;
    if (!start || !end) return reply.code(400).send({ error: "start and end required" });
    const rows = await query<any>(
      `SELECT id, annotated_at, label, created_at
       FROM chart_annotations
       WHERE user_id = $1
         AND annotated_at >= $2::timestamptz
         AND annotated_at <= $3::timestamptz
       ORDER BY annotated_at ASC`,
      [userId, start, end]
    );
    return rows;
  });

  // POST /api/annotations  { annotated_at, label }
  app.post("/", async (req, reply) => {
    const userId = (req as any).user_id;
    const { annotated_at, label } = req.body as any;
    if (!annotated_at || !label?.trim()) {
      return reply.code(400).send({ error: "annotated_at and label required" });
    }
    const [row] = await query<any>(
      `INSERT INTO chart_annotations (user_id, annotated_at, label)
       VALUES ($1, $2::timestamptz, $3)
       RETURNING id, annotated_at, label, created_at`,
      [userId, annotated_at, label.trim()]
    );
    return reply.code(201).send(row);
  });

  // DELETE /api/annotations/:id
  app.delete("/:id", async (req, reply) => {
    const userId = (req as any).user_id;
    const { id } = req.params as any;
    const result = await query<any>(
      `DELETE FROM chart_annotations WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId]
    );
    if (!result.length) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });
}
