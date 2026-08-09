import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

/**
 * "Best days" reverse-engineering.
 *
 * daily_summaries.overall_score is a weighted composite (glucose 2× / sleep 2×
 * / activity 1.5× / hydration 1× / nutrition 1× / mood 2× / productivity 1× /
 * stress 0.5×). This rule finds the user's top-20% days by that score and
 * asks: what BEHAVIORS were significantly more common on those days vs
 * everything else?
 *
 * The candidate behaviors we compare:
 *   - Sleep ≥ 7h   (`sleep.minutes` ≥ 420)
 *   - Steps ≥ 8k   (`activity.steps` ≥ 8000)
 *   - Water goal met (`hydration.glasses` ≥ `hydration.goal`)
 *   - Any exercise session that day (join on exercise_sessions)
 *   - Any mindfulness log that day (join on metric_logs / journal)
 *   - Mood journal logged (`mood.entryCount` > 0)
 *   - Zero substances (`substance_logs` empty for that day)
 *
 * We fire the insight when at least 2 behaviors show a >20 percentage-point
 * lift on best days vs the rest.
 */
export const BestDaysCommonRule: InsightRule = {
  id: "best_days_common",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      date: string;
      overall_score: number | null;
      sleep_min: number | null;
      steps: number | null;
      glasses: number | null;
      water_goal: number | null;
      mood_count: number | null;
      had_exercise: boolean;
      had_mindfulness: boolean;
      any_substance: boolean;
    }>(
      `SELECT
         ds.date::text AS date,
         ds.overall_score,
         (ds.summary_data->'sleep'->>'minutes')::numeric      AS sleep_min,
         (ds.summary_data->'activity'->>'steps')::numeric     AS steps,
         (ds.summary_data->'hydration'->>'glasses')::numeric  AS glasses,
         COALESCE((ds.summary_data->'hydration'->>'goal')::numeric, 8) AS water_goal,
         (ds.summary_data->'mood'->>'entryCount')::numeric    AS mood_count,
         EXISTS (SELECT 1 FROM exercise_sessions es WHERE es.user_id = ds.user_id AND es.started_at::date = ds.date) AS had_exercise,
         EXISTS (SELECT 1 FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
                 WHERE m.user_id = ds.user_id AND m.name = 'mindfulness'
                   AND ml.logged_at::date = ds.date) AS had_mindfulness,
         EXISTS (SELECT 1 FROM substance_logs sl WHERE sl.user_id = ds.user_id AND sl.logged_at::date = ds.date) AS any_substance
       FROM daily_summaries ds
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 90
         AND ds.overall_score IS NOT NULL`,
      [userId]
    );

    if (rows.length < 30) return null;

    // Rank by overall_score descending; top 20% are "best days".
    const sorted = [...rows].sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
    const topN = Math.max(6, Math.floor(sorted.length * 0.2));
    const best = sorted.slice(0, topN);
    const rest = sorted.slice(topN);
    if (best.length < 6 || rest.length < 6) return null;

    // Candidate behaviors — (label, predicate)
    const behaviors: Array<{ label: string; test: (r: typeof rows[0]) => boolean; positive: boolean }> = [
      { label: "sleep ≥ 7h",              test: (r) => Number(r.sleep_min) >= 420, positive: true },
      { label: "walked 8k+ steps",        test: (r) => Number(r.steps) >= 8000, positive: true },
      { label: "hit your water goal",     test: (r) => Number(r.glasses) >= Number(r.water_goal), positive: true },
      { label: "did any exercise",        test: (r) => r.had_exercise, positive: true },
      { label: "practiced mindfulness",   test: (r) => r.had_mindfulness, positive: true },
      { label: "journaled your mood",     test: (r) => Number(r.mood_count) > 0, positive: true },
      { label: "skipped alcohol/caffeine",test: (r) => !r.any_substance, positive: true },
    ];

    const bestCount = best.length;
    const restCount = rest.length;

    // Compute lift per behavior. Only surface those with a ≥20 percentage-point
    // gap so the copy is confident and non-obvious.
    const scored = behaviors
      .map(({ label, test }) => {
        const bestPct = best.filter(test).length / bestCount;
        const restPct = rest.filter(test).length / restCount;
        const lift = bestPct - restPct;
        return { label, bestPct, restPct, lift };
      })
      .filter((b) => b.lift >= 0.2)  // 20-percentage-point lift minimum
      .sort((a, b) => b.lift - a.lift);

    if (scored.length < 2) return null;

    const top3 = scored.slice(0, 3);
    const bullets = top3.map((b) => `${b.label} (${Math.round(b.bestPct * 100)}% of best days vs ${Math.round(b.restPct * 100)}% otherwise)`).join("; ");

    // Confidence: sample size = min(bestCount, restCount), effect ratio =
    // largest lift among the top 3 divided by 0.5 (a 50pp lift = max).
    const { score, label } = calcConfidence(
      Math.min(bestCount, restCount),
      Math.min(1, top3[0].lift / 0.5),
    );

    return {
      title: `Your best days tend to share ${top3.length} thing${top3.length > 1 ? "s" : ""}`,
      description: `Looking at your ${bestCount} best days (top 20% by overall wellness score), these behaviors were the biggest differentiators: ${bullets}. When you stack them, your best days follow.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        best_days_count: bestCount,
        rest_days_count: restCount,
        top_behaviors: top3.map((b) => ({
          label: b.label,
          best_pct: Math.round(b.bestPct * 100),
          rest_pct: Math.round(b.restPct * 100),
          lift_pct_points: Math.round(b.lift * 100),
        })),
      },
    };
  },
};
