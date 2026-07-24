import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const RestingHRVsExerciseRule: InsightRule = {
  id: "resting_hr_vs_exercise",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; resting_hr: number; exercised: boolean }>(
      `WITH ex_days AS (
         SELECT DISTINCT DATE(started_at) AS day
         FROM exercise_sessions
         WHERE user_id = $1
           AND started_at >= CURRENT_DATE - 60
           AND ended_at IS NOT NULL
       )
       SELECT
         DATE(hr.recorded_at)::text AS date,
         MIN(hr.bpm) AS resting_hr,
         BOOL_OR(ex.day IS NOT NULL) AS exercised
       FROM heart_rate_readings hr
       LEFT JOIN ex_days ex ON ex.day = DATE(hr.recorded_at)
       WHERE hr.user_id = $1
         AND hr.recorded_at >= CURRENT_DATE - 60
       GROUP BY DATE(hr.recorded_at)
       ORDER BY date DESC`,
      [userId]
    );

    if (rows.length < 12) return null;

    const exerciseDays   = rows.filter(r => r.exercised);
    const noExerciseDays = rows.filter(r => !r.exercised);

    if (exerciseDays.length < 6 || noExerciseDays.length < 6) return null;

    const avgHrExercise   = exerciseDays.reduce((s, r) => s + r.resting_hr, 0) / exerciseDays.length;
    const avgHrNoExercise = noExerciseDays.reduce((s, r) => s + r.resting_hr, 0) / noExerciseDays.length;

    // diff > 0 means resting HR is higher on no-exercise days (typical pattern)
    const diff = avgHrNoExercise - avgHrExercise;
    if (Math.abs(diff) < 3) return null;

    const effectRatio = Math.abs(diff) / 20; // 20 bpm = full effect
    const { score, label } = calcConfidence(
      Math.min(exerciseDays.length, noExerciseDays.length),
      effectRatio
    );

    // direction describes HR on exercise days relative to non-exercise days
    const direction = diff > 0 ? "lower" : "higher";

    return {
      title: `Resting heart rate tends to be ${direction} on exercise days`,
      description: `Over the last 60 days, your average resting heart rate (lowest reading of the day) was ${avgHrExercise.toFixed(0)} bpm on the ${exerciseDays.length} days with a completed workout, compared to ${avgHrNoExercise.toFixed(0)} bpm on the ${noExerciseDays.length} days without exercise — a difference of ${Math.abs(diff).toFixed(0)} bpm.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        exercise_days: exerciseDays.length,
        no_exercise_days: noExerciseDays.length,
        avg_resting_hr_exercise: avgHrExercise.toFixed(1),
        avg_resting_hr_no_exercise: avgHrNoExercise.toFixed(1),
        bpm_difference: Math.abs(diff).toFixed(1),
        direction,
      },
    };
  },
};
