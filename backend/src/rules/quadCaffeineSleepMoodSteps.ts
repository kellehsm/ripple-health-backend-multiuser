import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// 4-metric interaction: caffeine + sleep quality → how these two together
// modulate next-day mood and step count. Finds if high caffeine on poor sleep
// predicts worse outcomes across both mood and activity.
export const QuadCaffeineSleepMoodStepsRule: InsightRule = {
  id: "quad_caffeine_sleep_mood_steps",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      date: string;
      caffeine_mg: number; sleep_min: number; avg_mood: number; steps: number;
    }>(
      `SELECT
         date::text,
         (summary_data->'nutrition'->>'totalCaffeine')::numeric AS caffeine_mg,
         (summary_data->'sleep'->>'minutes')::numeric           AS sleep_min,
         (summary_data->'mood'->>'averageScore')::numeric       AS avg_mood,
         (summary_data->'activity'->>'steps')::numeric          AS steps
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND summary_data->'nutrition'->>'totalCaffeine' IS NOT NULL
         AND summary_data->'sleep'->>'minutes' IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
         AND summary_data->'activity'->>'steps' IS NOT NULL
       ORDER BY date ASC`,
      [userId]
    );

    if (rows.length < 30) return null;

    // Median caffeine threshold
    const sorted = [...rows].sort((a, b) => Number(a.caffeine_mg) - Number(b.caffeine_mg));
    const caffThresh = Number(sorted[Math.floor(sorted.length * 0.6)].caffeine_mg);
    if (caffThresh < 50) return null;

    type R = typeof rows[0];
    const highCaff = (r: R) => Number(r.caffeine_mg) >= caffThresh;
    const poorSleep = (r: R) => Number(r.sleep_min) < 360;
    const goodSleep = (r: R) => Number(r.sleep_min) >= 420;

    const worstCase = rows.filter(r => highCaff(r) && poorSleep(r));
    const bestCase  = rows.filter(r => !highCaff(r) && goodSleep(r));
    const highCaffGoodSleep = rows.filter(r => highCaff(r) && goodSleep(r));
    const lowCaffPoorSleep  = rows.filter(r => !highCaff(r) && poorSleep(r));

    if (worstCase.length < 5 || bestCase.length < 5) return null;

    const avgMood  = (arr: R[]) => arr.reduce((s, r) => s + Number(r.avg_mood), 0) / arr.length;
    const avgSteps = (arr: R[]) => arr.reduce((s, r) => s + Number(r.steps), 0) / arr.length;

    const moodWorst = avgMood(worstCase);
    const moodBest  = avgMood(bestCase);
    const moodDiff  = moodBest - moodWorst;
    if (moodDiff < 0.3) return null;

    const stepsWorst = avgSteps(worstCase);
    const stepsBest  = avgSteps(bestCase);

    const { score, label } = calcConfidence(Math.min(worstCase.length, bestCase.length), moodDiff / 4);

    const midLines = [
      highCaffGoodSleep.length >= 4
        ? `High caffeine + good sleep: ${avgMood(highCaffGoodSleep).toFixed(1)}/5 mood, ${Math.round(avgSteps(highCaffGoodSleep)).toLocaleString()} steps`
        : null,
      lowCaffPoorSleep.length >= 4
        ? `Low caffeine + poor sleep: ${avgMood(lowCaffPoorSleep).toFixed(1)}/5 mood, ${Math.round(avgSteps(lowCaffPoorSleep)).toLocaleString()} steps`
        : null,
    ].filter(Boolean).join(". ");

    return {
      title: "High caffeine + poor sleep is your worst combination for energy and mood",
      description: `Days with high caffeine (${Math.round(caffThresh)}mg+) AND under 6h sleep averaged ${moodWorst.toFixed(1)}/5 mood and ${Math.round(stepsWorst).toLocaleString()} steps. Your best days (lower caffeine + 7+ hours sleep): ${moodBest.toFixed(1)}/5 mood and ${Math.round(stepsBest).toLocaleString()} steps.${midLines ? " Mid-tiers: " + midLines + "." : ""}`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        caffeine_threshold_mg: Math.round(caffThresh),
        worst_case_days: worstCase.length,
        best_case_days: bestCase.length,
        mood_worst: moodWorst.toFixed(2),
        mood_best: moodBest.toFixed(2),
        mood_gap: moodDiff.toFixed(2),
        steps_worst: Math.round(stepsWorst),
        steps_best: Math.round(stepsBest),
      },
    };
  },
};
