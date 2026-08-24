import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getActiveInsights, getInsightHistory, runInsightsForUser } from "../services/insightsEngine.js";
import { getExperimentTemplate, autoGenerateTemplate } from "../services/insightExperimentTemplates.js";
import { adjustRuleWeight } from "../services/insightRanker.js";
import { pickNudgeForUser } from "../services/nudges.js";

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

  // GET /insights/impact/:rule_id — cross-user average outcome so an insight
  // card can show "People who tried this saw ~X change".  Returns
  // { available: false } when the sample size is too small to be honest.
  app.get("/impact/:rule_id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req) => {
    const { rule_id } = req.params as { rule_id: string };
    const [row] = await query<any>(
      `SELECT
         COUNT(*)::int                                                   AS sample,
         ROUND(AVG(after_mean - before_mean)::numeric, 1)::float          AS mean_delta,
         MODE() WITHIN GROUP (ORDER BY direction)                        AS common_direction
       FROM insight_experiment_results
       WHERE rule_id = $1 AND before_mean IS NOT NULL AND after_mean IS NOT NULL`,
      [rule_id]
    );
    const sample = row?.sample ?? 0;
    if (sample < 5) return { available: false, sample };
    return {
      available: true,
      sample,
      mean_delta: row.mean_delta,
      direction: row.common_direction,
    };
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

  // POST /insights/:id/snooze — hide for N days (default 7). Body: { days? }
  app.post("/:id/snooze", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const daysRaw = (req.body as any)?.days;
    const days = typeof daysRaw === "number" && daysRaw > 0 && daysRaw <= 90 ? daysRaw : 7;
    const rows = await query(
      `UPDATE user_insights
         SET snoozed_until = NOW() + ($3 || ' days')::interval, updated_at = NOW()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user_id, days]
    );
    if (!rows.length) return reply.code(404).send({ error: "Insight not found" });
    return { ok: true, days };
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
  app.post("/regenerate", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async (req) => {
    const user_id = req.user_id;
    const result = await runInsightsForUser(user_id, { force: true });
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
    // Continuous weight adjustment — feeds insightRanker on the next run.
    await adjustRuleWeight(user_id, insight.rule_id, rating);
    return { ok: true };
  });

  // POST /insights/:id/pin — toggle bookmark state
  app.post("/:id/pin", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const { pinned } = (req.body ?? {}) as { pinned?: boolean };
    const rows = await query(
      `UPDATE user_insights SET pinned = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3 RETURNING id`,
      [!!pinned, id, user_id]
    );
    if (!rows.length) return reply.code(404).send({ error: "Insight not found" });
    if (pinned) {
      await query(
        `INSERT INTO insight_pins (user_id, insight_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [user_id, id]
      );
    } else {
      await query(`DELETE FROM insight_pins WHERE user_id = $1 AND insight_id = $2`, [user_id, id]);
    }
    return { ok: true, pinned: !!pinned };
  });

  // GET /insights/categories — active insight counts grouped by type/domain.
  app.get("/categories", async (req) => {
    const user_id = req.user_id;
    return query<{ type: string; count: number }>(
      `SELECT type, COUNT(*)::int AS count
       FROM user_insights
       WHERE user_id = $1 AND status = 'active'
       GROUP BY type
       ORDER BY count DESC`,
      [user_id]
    );
  });

  // GET /insights/timeline — insight lifecycle (first_detected, last_confirmed,
  // dismissed, resurfaced) newest-first.
  app.get("/timeline", async (req) => {
    const user_id = req.user_id;
    return query(
      `SELECT id, rule_id, type, title, first_detected, last_confirmed, status, dismissed
       FROM user_insights
       WHERE user_id = $1
       ORDER BY last_confirmed DESC, first_detected DESC
       LIMIT 200`,
      [user_id]
    );
  });

  // GET /insights/digest — Insight-of-the-week + one micro-nudge candidate.
  app.get("/digest", async (req) => {
    const user_id = req.user_id;
    const [top] = await query<any>(
      `SELECT id, rule_id, title, description, confidence, confidence_score,
              rank_score, supporting_data, first_detected, last_confirmed
       FROM user_insights
       WHERE user_id = $1 AND status = 'active' AND dismissed = FALSE
         AND NOT (supporting_data ? 'duplicate_of')
       ORDER BY pinned DESC NULLS LAST,
                COALESCE(rank_score, confidence_score / 100.0) DESC
       LIMIT 1`,
      [user_id]
    );
    const nudge = await pickNudgeForUser(user_id);
    return { top_insight: top ?? null, nudge };
  });

  // POST /insights/:id/explain — LLM-friendly payload. Frontend sends this
  // to whatever LLM adapter it wants; server just returns the structured
  // context, never the final prose (keeps model choice on the client).
  app.post("/:id/explain", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const [insight] = await query<any>(
      `SELECT id, rule_id, type, title, description, supporting_data, confidence,
              confidence_score, first_detected, last_confirmed
       FROM user_insights WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!insight) return reply.code(404).send({ error: "Insight not found" });
    return {
      system_guidance:
        "You are helping the user interpret a personal wellness pattern. " +
        "Stay descriptive, never diagnostic. Never suggest medication changes. " +
        "Reference this specific insight's data — do not generalize.",
      insight,
    };
  });

  // GET /insights/:id/debug — explainability dump: rule, supporting data,
  // engine run history for this rule.
  app.get("/:id/debug", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const [insight] = await query<any>(
      `SELECT * FROM user_insights WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!insight) return reply.code(404).send({ error: "Insight not found" });
    const runs = await query(
      `SELECT ran_at, runtime_ms, tier, rule_version, fired, fdr_rejected
       FROM insight_rule_runs
       WHERE user_id = $1 AND rule_id = $2
       ORDER BY ran_at DESC LIMIT 20`,
      [user_id, insight.rule_id]
    );
    const feedbackHistory = await query(
      `SELECT rating, submitted_at FROM insight_feedback
       WHERE user_id = $1 AND rule_id = $2 ORDER BY submitted_at DESC LIMIT 10`,
      [user_id, insight.rule_id]
    );
    const [weight] = await query<{ weight: number }>(
      `SELECT weight FROM user_rule_weights WHERE user_id = $1 AND rule_id = $2`,
      [user_id, insight.rule_id]
    );
    return {
      insight,
      run_history: runs,
      feedback_history: feedbackHistory,
      user_rule_weight: weight?.weight ?? 1.0,
    };
  });

  // POST /insights/:id/try — seed a lightweight 14-21 day experiment based
  // on the rule template. Returns { ok: false, reason } if the rule isn't
  // actionable (no template exists yet).
  app.post("/:id/try", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as { id: string };
    const [insight] = await query<{ rule_id: string; title: string; supporting_data: any }>(
      `SELECT rule_id, title, supporting_data FROM user_insights WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!insight) return reply.code(404).send({ error: "Insight not found" });

    const template =
      getExperimentTemplate(insight.rule_id) ??
      autoGenerateTemplate(insight.rule_id, insight.supporting_data ?? {});

    const [row] = await query<{ id: string }>(
      `INSERT INTO experiments (user_id, description, start_date, end_date, metrics)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + ($3::int - 1), $4)
       RETURNING id`,
      [user_id, template.description, template.duration_days, template.metrics]
    );
    return { ok: true, experiment_id: row.id, description: template.description };
  });
}
