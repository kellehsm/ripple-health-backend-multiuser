import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getActiveInsights, getInsightHistory, runInsightsForUser } from "../services/insightsEngine.js";
import { getExperimentTemplate } from "../services/insightExperimentTemplates.js";

const VALID_RATINGS = new Set(["helpful", "neutral", "not_useful", "already_knew"]);

/** Rules the user has downvoted at least this many times are suppressed. */
const SUPPRESSION_THRESHOLD = 3;

export default async function insightsRoutes(app: FastifyInstance) {
  // GET /insights — active, undismissed insights minus rules the user has
  // repeatedly rated "not useful" (SUPPRESSION_THRESHOLD times or more).
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const all = await getActiveInsights(user_id);
    if (all.length === 0) return all;

    const suppressed = await query<{ rule_id: string }>(
      `SELECT rule_id FROM insight_feedback
       WHERE user_id = $1 AND rating = 'not_useful'
       GROUP BY rule_id
       HAVING COUNT(*) >= $2`,
      [user_id, SUPPRESSION_THRESHOLD]
    );
    if (suppressed.length === 0) return all;
    const dead = new Set(suppressed.map((r) => r.rule_id));
    return all.filter((i) => !dead.has(i.rule_id));
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

  // POST /insights/:id/feedback — { rating: 'helpful'|'neutral'|'not_useful'|'already_knew' }
  // Latest rating per (user, insight) wins via upsert.
  app.post("/:id/feedback", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const { rating } = (req.body ?? {}) as { rating?: string };
    if (!rating || !VALID_RATINGS.has(rating)) {
      return reply.code(400).send({ error: "rating must be one of: helpful, neutral, not_useful, already_knew" });
    }
    const [insight] = await query<{ rule_id: string }>(
      `SELECT rule_id FROM user_insights WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!insight) return reply.code(404).send({ error: "Insight not found" });
    await query(
      `INSERT INTO insight_feedback (user_id, insight_id, rule_id, rating)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, insight_id) DO UPDATE SET
         rating = EXCLUDED.rating, submitted_at = NOW()`,
      [user_id, id, insight.rule_id, rating]
    );
    return { ok: true };
  });

  // POST /insights/:id/try — seed a lightweight 14-21 day experiment based
  // on the rule template. Returns { ok: false, reason } if the rule isn't
  // actionable (no template exists yet).
  app.post("/:id/try", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const [insight] = await query<{ rule_id: string; title: string }>(
      `SELECT rule_id, title FROM user_insights WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!insight) return reply.code(404).send({ error: "Insight not found" });

    const template = getExperimentTemplate(insight.rule_id);
    if (!template) return { ok: false, reason: "No actionable template for this insight yet." };

    const [row] = await query<{ id: string }>(
      `INSERT INTO experiments (user_id, description, start_date, end_date, metrics)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + ($3::int - 1), $4)
       RETURNING id`,
      [user_id, template.description, template.duration_days, template.metrics]
    );
    return { ok: true, experiment_id: row.id, description: template.description };
  });
}
