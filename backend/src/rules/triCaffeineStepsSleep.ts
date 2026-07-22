import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// High caffeine + low steps → significantly worse sleep than high caffeine + high steps.
// The insight is that exercise appears to offset caffeine's sleep disruption.
export const TriCaffeineStepsSleepRule: InsightRule = {
  id: "tri_caffeine_steps_sleep",
  type: "sleep",
  minDays: 28,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      caffeine_mg: number; steps: number; sleep_min: number;
    }>(
      `SELECT
         (summary_data->'nutrition'->>'totalCaffeine')::numeric  AS caffeine_mg,
         (summary_data->'activity'->>'steps')::numeric           AS steps,
         (summary_data->'sleep'->>'minutes')::numeric            AS sleep_min
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'nutrition'->>'totalCaffeine' IS NOT NULL
         AND summary_data->'activity'->>'steps' IS NOT NULL
         AND summary_data->'sleep'->>'minutes' IS NOT NULL`,
      [userId]
    );

    if (rows.length < 28) return null;

    // Find the caffeine threshold (top 40% of caffeine days)
    const sorted = [...rows].sort((a, b) => Number(a.caffeine_mg) - Number(b.caffeine_mg));
    const caffThreshold = Number(sorted[Math.floor(sorted.length * 0.6)].caffeine_mg);
    if (caffThreshold < 50) return null; // not enough caffeine variation

    const highCaff = rows.filter(r => Number(r.caffeine_mg) >= caffThreshold);
    if (highCaff.length < 10) return null;

    const highCaffHighSteps = highCaff.filter(r => Number(r.steps) >= 8000);
    const highCaffLowSteps  = highCaff.filter(r => Number(r.steps) < 5000);

    if (highCaffHighSteps.length < 5 || highCaffLowSteps.length < 5) return null;

    const avgSleep = (arr: typeof rows) =>
      arr.reduce((s, r) => s + Number(r.sleep_min), 0) / arr.length;

    const sleepActive  = avgSleep(highCaffHighSteps);
    const sleepSedent  = avgSleep(highCaffLowSteps);
    const diff = sleepActive - sleepSedent; // positive = more sleep when active

    if (diff < 15) return null; // less than 15 min difference not meaningful

    const effectRatio = diff / Math.max(sleepActive, sleepSedent);
    const { score, label } = calcConfidence(
      Math.min(highCaffHighSteps.length, highCaffLowSteps.length),
      effectRatio
    );

    const toH = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;

    return {
      title: "Exercise appears to offset caffeine's sleep disruption",
      description: `On high-caffeine days (${Math.round(caffThreshold)}mg+), you slept ${toH(sleepActive)} when you also hit 8,000+ steps — but only ${toH(sleepSedent)} on low-step days. Being active seems to help metabolize caffeine before bedtime. (${highCaffHighSteps.length} active vs ${highCaffLowSteps.length} sedentary high-caffeine days.)`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        caffeine_threshold_mg: Math.round(caffThreshold),
        high_caff_high_steps_days: highCaffHighSteps.length,
        high_caff_low_steps_days: highCaffLowSteps.length,
        avg_sleep_active_min: Math.round(sleepActive),
        avg_sleep_sedentary_min: Math.round(sleepSedent),
        sleep_difference_min: Math.round(diff),
      },
    };
  },
};
