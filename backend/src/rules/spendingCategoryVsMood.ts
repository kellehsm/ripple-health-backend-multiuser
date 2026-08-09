import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Which spending category most correlates with mood movement? Groups spending
// by category, then compares user's average mood on days they spent in that
// category vs days they didn't.
export const SpendingCategoryVsMoodRule: InsightRule = {
  id: "spending_category_vs_mood",
  type: "mood",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ category: string; days_spent: number; days_not_spent: number; mood_when_spent: number; mood_when_not: number }>(
      `WITH mood_days AS (
        SELECT je.logged_at::date AS day, AVG(je.mood_score)::float8 AS mood
        FROM journal_entries je
        WHERE je.user_id = $1
          AND je.mood_score IS NOT NULL
          AND je.logged_at >= NOW() - INTERVAL '90 days'
        GROUP BY je.logged_at::date
      ),
      cat_days AS (
        SELECT DISTINCT category, logged_at::date AS day
        FROM spending_entries
        WHERE user_id = $1
          AND category IS NOT NULL
          AND logged_at >= NOW() - INTERVAL '90 days'
      )
      SELECT c.category,
             COUNT(DISTINCT c.day)::int AS days_spent,
             (SELECT COUNT(DISTINCT day) FROM mood_days)::int - COUNT(DISTINCT c.day)::int AS days_not_spent,
             AVG(md_spent.mood)::float8 AS mood_when_spent,
             (SELECT AVG(mood) FROM mood_days md_all WHERE md_all.day NOT IN (SELECT day FROM cat_days WHERE category = c.category))::float8 AS mood_when_not
      FROM cat_days c
      JOIN mood_days md_spent ON md_spent.day = c.day
      GROUP BY c.category
      HAVING COUNT(DISTINCT c.day) >= 5
      ORDER BY ABS(AVG(md_spent.mood) - (SELECT AVG(mood) FROM mood_days md_all WHERE md_all.day NOT IN (SELECT day FROM cat_days WHERE category = c.category))) DESC
      LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    const spent = Number(r.mood_when_spent);
    const not   = Number(r.mood_when_not);
    if (!Number.isFinite(spent) || !Number.isFinite(not)) return null;

    const diff = spent - not;
    if (Math.abs(diff) < 0.3) return null;

    const effectRatio = Math.min(1, Math.abs(diff) / 2);
    const { score, label } = calcConfidence(r.days_spent, effectRatio);
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Days with "${r.category}" spending → ${direction} mood`,
      description: `Days when you spent on ${r.category} your mood averaged ${spent.toFixed(1)}/5, compared to ${not.toFixed(1)}/5 on other days — a difference of ${Math.abs(diff).toFixed(2)} points across ${r.days_spent} spending days.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: r.days_spent,
      supportingData: {
        category: r.category,
        days_spent: r.days_spent,
        avg_mood_spent: spent.toFixed(2),
        avg_mood_not: not.toFixed(2),
        mood_difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
