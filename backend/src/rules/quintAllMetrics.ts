import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// 5-metric "perfect day" profile: sleep + steps + water + mood + glucose.
// Finds whether your best-possible days (all 5 in range) are meaningfully
// better than days where fewer goals are met.
export const QuintAllMetricsRule: InsightRule = {
  id: "quint_all_metrics",
  type: "combined",
  minDays: 40,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      sleep_min: number; steps: number; glasses: number; goal: number;
      avg_mood: number; glucose_avg: number;
    }>(
      `SELECT
         (summary_data->'sleep'->>'minutes')::numeric          AS sleep_min,
         (summary_data->'activity'->>'steps')::numeric         AS steps,
         (summary_data->'hydration'->>'glasses')::numeric      AS glasses,
         COALESCE((summary_data->'hydration'->>'goal')::numeric, 8) AS goal,
         (summary_data->'mood'->>'averageScore')::numeric      AS avg_mood,
         (summary_data->'glucose'->>'average')::numeric        AS glucose_avg
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'sleep'->>'minutes' IS NOT NULL
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND summary_data->'hydration'->>'glasses' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
         AND summary_data->'glucose'->>'average' IS NOT NULL
         AND (summary_data->'glucose'->>'average')::numeric > 0`,
      [userId]
    );

    if (rows.length < 40) return null;

    type R = typeof rows[0];
    const metSleep  = (r: R) => Number(r.sleep_min) >= 420;
    const metSteps  = (r: R) => Number(r.steps) >= 8000;
    const metWater  = (r: R) => Number(r.glasses) >= Number(r.goal);
    const metMood   = (r: R) => Number(r.avg_mood) >= 3.5;
    const metGluc   = (r: R) => Number(r.glucose_avg) <= 130;
    const goalsOf   = (r: R) => [metSleep(r), metSteps(r), metWater(r), metMood(r), metGluc(r)].filter(Boolean).length;

    // Bucket by number of goals met
    const five  = rows.filter(r => goalsOf(r) === 5);
    const four  = rows.filter(r => goalsOf(r) === 4);
    const three = rows.filter(r => goalsOf(r) === 3);
    const two   = rows.filter(r => goalsOf(r) === 2);
    const zeroOne = rows.filter(r => goalsOf(r) <= 1);

    if (five.length < 3 || zeroOne.length < 3) return null;

    const avgMood = (arr: R[]) => arr.reduce((s, r) => s + Number(r.avg_mood), 0) / arr.length;
    const moodFive    = avgMood(five);
    const moodZeroOne = avgMood(zeroOne);
    const diff        = moodFive - moodZeroOne;

    if (diff < 0.5) return null;

    const { score, label } = calcConfidence(Math.min(five.length, zeroOne.length), diff / 4);

    const tiers = [
      { n: 5, days: five, mood: moodFive },
      four.length >= 3  ? { n: 4, days: four,  mood: avgMood(four)  } : null,
      three.length >= 3 ? { n: 3, days: three, mood: avgMood(three) } : null,
      two.length >= 3   ? { n: 2, days: two,   mood: avgMood(two)   } : null,
      zeroOne.length >= 3 ? { n: "0-1", days: zeroOne, mood: moodZeroOne } : null,
    ].filter(Boolean) as { n: number | string; days: R[]; mood: number }[];

    const tierDesc = tiers.map(t => `${t.n}/5 goals: ${t.mood.toFixed(1)}/5 mood (${t.days.length} days)`).join(" → ");

    return {
      title: "More goals met = noticeably better mood across 5 key metrics",
      description: `Across sleep, steps, water, mood tracking, and glucose targets — each additional goal met lifts your day. ${tierDesc}. Your "perfect day" (all 5) averaged ${moodFive.toFixed(1)}/5 mood vs ${moodZeroOne.toFixed(1)}/5 when most were missed.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        days_5_goals: five.length,
        days_4_goals: four.length,
        days_3_goals: three.length,
        days_2_goals: two.length,
        days_0_1_goals: zeroOne.length,
        mood_5_goals: moodFive.toFixed(2),
        mood_4_goals: four.length >= 3 ? avgMood(four).toFixed(2) : null,
        mood_3_goals: three.length >= 3 ? avgMood(three).toFixed(2) : null,
        mood_0_1_goals: moodZeroOne.toFixed(2),
        mood_lift_5_vs_0: diff.toFixed(2),
      },
    };
  },
};
