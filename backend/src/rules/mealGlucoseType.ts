import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const MealGlucoseTypeRule: InsightRule = {
  id: "meal_glucose_type",
  type: "glucose",
  minDays: 10,

  async run(userId: string): Promise<InsightResult | null> {
    // For each meal with a known meal_type, compute avg glucose 1–2h after logging
    const rows = await query<{ meal_type: string; post_meal_avg: number; meal_count: number }>(
      `SELECT
         m.meal_type,
         ROUND(AVG(g.mg_dl)) AS post_meal_avg,
         COUNT(DISTINCT m.id) AS meal_count
       FROM meals m
       JOIN glucose_readings g
         ON g.user_id = m.user_id
         AND g.recorded_at BETWEEN m.logged_at + INTERVAL '30 minutes'
                                AND m.logged_at + INTERVAL '2 hours'
       WHERE m.user_id = $1
         AND m.logged_at >= NOW() - INTERVAL '60 days'
         AND m.meal_type IS NOT NULL
         AND m.meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')
       GROUP BY m.meal_type
       HAVING COUNT(DISTINCT m.id) >= 5`,
      [userId]
    );

    if (rows.length < 2) return null;

    const types = rows.map(r => ({ type: r.meal_type, avg: Number(r.post_meal_avg), count: Number(r.meal_count) }));
    types.sort((a, b) => b.avg - a.avg);

    const highest = types[0];
    const lowest  = types[types.length - 1];
    const diff = highest.avg - lowest.avg;

    if (diff < 10) return null; // less than 10 mg/dL difference not notable

    const effectRatio = diff / 60; // 60 mg/dL = large effect
    const minCount = Math.min(highest.count, lowest.count);
    const { score, label } = calcConfidence(minCount, effectRatio);

    const typeLabels = types.map(t => `${t.type} (avg ${t.avg} mg/dL)`).join(", ");

    return {
      title: `${highest.type.charAt(0).toUpperCase() + highest.type.slice(1)} tends to produce the highest post-meal glucose`,
      description: `Looking at glucose 30–120 minutes after meals over the last 60 days: ${typeLabels}. That's a ${diff} mg/dL spread between your highest and lowest meal types.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: types.reduce((s, t) => s + t.count, 0),
      supportingData: {
        meal_types: types,
        highest_type: highest.type,
        lowest_type: lowest.type,
        highest_avg_mg_dl: highest.avg,
        lowest_avg_mg_dl: lowest.avg,
        spread_mg_dl: diff,
      },
    };
  },
};
