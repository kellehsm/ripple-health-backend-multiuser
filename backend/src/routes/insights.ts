import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getActiveInsights, getInsightHistory, runInsightsForUser } from "../services/insightsEngine.js";

export default async function insightsRoutes(app: FastifyInstance) {
  // GET /insights — active, undismissed insights for the current user
  app.get("/", async (req) => {
    const user_id = req.user_id;
    return getActiveInsights(user_id);
  });

  // GET /insights/history — all insights including dismissed/stale
  app.get("/history", async (req) => {
    const user_id = req.user_id;
    return getInsightHistory(user_id);
  });

  // POST /insights/:id/dismiss — dismiss an insight so it stops showing
  app.post("/:id/dismiss", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const rows = await query(
      `UPDATE user_insights SET dismissed = TRUE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user_id]
    );
    if (!rows.length) return reply.code(404).send({ error: "Insight not found" });
    return { ok: true };
  });

  // POST /insights/:id/undismiss — restore a dismissed insight
  app.post("/:id/undismiss", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const rows = await query(
      `UPDATE user_insights SET dismissed = FALSE, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user_id]
    );
    if (!rows.length) return reply.code(404).send({ error: "Insight not found" });
    return { ok: true };
  });

  // POST /insights/regenerate — force-run the engine for this user
  app.post("/regenerate", async (req) => {
    const user_id = req.user_id;
    const result = await runInsightsForUser(user_id);
    return { ok: true, ...result };
  });
}
