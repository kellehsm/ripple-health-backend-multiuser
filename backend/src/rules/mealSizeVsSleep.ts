import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Total evening calorie load (all meals logged after 18:00) vs that night's
// sleep quality. Common wisdom is that big late dinners hurt sleep — this
// rule surfaces whether that's true for THIS user.
export const MealSizeVsSleepRule: InsightRule = {
  id: "meal_size_vs_sleep",
  type: "sleep",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; evening_cal: number; sleep_quality: number | null }>(
      `WITH nightly_cal AS (
        SELECT logged_at::date AS date,
               SUM(calories * servings)::float8 AS evening_cal
        FROM meals
        WHERE user_id = $1
          AND logged_at >= NOW() - INTERVAL '60 days'
          AND EXTRACT(HOUR FROM logged_at) >= 18
          AND calories IS NOT NULL
        GROUP BY logged_at::date
      )
      SELECT nc.date::text AS date,
             nc.evening_cal,
             (ds.summary_data->'sleep'->>'averageQuality')::numeric AS sleep_quality
      FROM nightly_cal nc
      JOIN daily_summaries ds ON ds.user_id = $1 AND ds.date = nc.date
      WHERE ds.summary_data->'sleep'->>'averageQuality' IS NOT NULL`,
      [userId]
    );
    if (rows.length < 21) return null;

    const heavyNights = rows.filter((r) => Number(r.evening_cal) >= 800);
    const lightNights = rows.filter((r) => Number(r.evening_cal) < 500);
    if (heavyNights.length < 5 || lightNights.length < 5) return null;

    const mean = (a: typeof rows) => a.reduce((s, r) => s + Number(r.sleep_quality ?? 0), 0) / a.length;
    const qHeavy = mean(heavyNights);
    const qLight = mean(lightNights);
    const diff = qLight - qHeavy;
    if (Math.abs(diff) < 3) return null; // <3 quality points = noise

    const effectRatio = Math.min(1, Math.abs(diff) / 30);
    const { score, label } = calcConfidence(Math.min(heavyNights.length, lightNights.length), effectRatio);
    const direction = diff > 0 ? "worse" : "better";

    return {
      title: `Big late dinners appear linked to ${direction} sleep`,
      description: `On nights with 800+ calories after 6pm, your sleep quality averaged ${qHeavy.toFixed(0)}/100, compared to ${qLight.toFixed(0)}/100 on lighter-evening nights (<500 cal) — a difference of ${Math.abs(diff).toFixed(0)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        heavy_dinner_nights: heavyNights.length,
        light_dinner_nights: lightNights.length,
        avg_quality_heavy: qHeavy.toFixed(1),
        avg_quality_light: qLight.toFixed(1),
        difference: diff.toFixed(1),
      },
    };
  },
};
