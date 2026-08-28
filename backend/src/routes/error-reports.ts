import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function errorReportsRoutes(app: FastifyInstance) {
  app.post("/", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const user_id = req.user_id;
    const { message, context, platform } = req.body as any;
    const safeMessage = message != null ? String(message).slice(0, 2000) : null;
    const safeContext = context != null ? String(context).slice(0, 10000) : null;
    const rows = await query<{ report_number: number }>(
      `INSERT INTO error_reports (user_id, message, context, platform)
       VALUES ($1, $2, $3, $4)
       RETURNING report_number`,
      [user_id, safeMessage, safeContext, platform ?? null]
    );
    return { report_number: rows[0].report_number };
  });
}
