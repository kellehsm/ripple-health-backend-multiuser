import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function medicationPrescribersRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    return query<any>(
      `SELECT id, name, specialty, phone, office_location, notes
       FROM medication_prescribers WHERE user_id = $1 ORDER BY name`,
      [req.user_id]
    );
  });

  app.post("/", async (req) => {
    const { name, specialty, phone, office_location, notes } = req.body as any;
    const [row] = await query<any>(
      `INSERT INTO medication_prescribers (user_id, name, specialty, phone, office_location, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user_id, name, specialty ?? null, phone ?? null, office_location ?? null, notes ?? null]
    );
    return row;
  });

  app.patch("/:id", async (req) => {
    const { name, specialty, phone, office_location, notes } = req.body as any;
    const [row] = await query<any>(
      `UPDATE medication_prescribers
       SET name = COALESCE($1, name), specialty = COALESCE($2, specialty),
           phone = COALESCE($3, phone), office_location = COALESCE($4, office_location),
           notes = COALESCE($5, notes)
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [name ?? null, specialty ?? null, phone ?? null, office_location ?? null,
       notes ?? null, (req.params as any).id, req.user_id]
    );
    if (!row) throw { statusCode: 404, message: "Not found" };
    return row;
  });

  app.delete("/:id", async (req) => {
    await query(
      `DELETE FROM medication_prescribers WHERE id = $1 AND user_id = $2`,
      [(req.params as any).id, req.user_id]
    );
    return { ok: true };
  });
}
