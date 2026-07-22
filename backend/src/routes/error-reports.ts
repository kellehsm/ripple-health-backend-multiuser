import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function errorReportsRoutes(app: FastifyInstance) {
  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { message, context, platform } = req.body as any;
    const rows = await query<{ report_number: number }>(
      `INSERT INTO error_reports (user_id, message, context, platform)
       VALUES ($1, $2, $3, $4)
       RETURNING report_number`,
      [user_id, message ?? null, context ?? null, platform ?? null]
    );
    return { report_number: rows[0].report_number };
  });
}
