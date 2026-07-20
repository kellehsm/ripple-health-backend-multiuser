import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const RestingHRVsExerciseRule: InsightRule = {
  id: "resting_hr_vs_exercise",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    // Get daily resting HR proxy (MIN bpm per day) for last 60 days
    const hrRows = await query<{ date: string; resting_hr: number }>(
      `SELECT
         DATE(recorded_at)::text AS date,
         MIN(bpm) AS resting_hr
       FROM heart_rate_readings
       WHERE user_id = $1
         AND recorded_at >= CURRENT_DATE - 60
       GROUP BY DATE(recorded_at)
       ORDER BY date DESC`,
      [userId]
    );

    if (hrRows.length < 12) return null;

    // For each HR day, check whether a completed exercise session exists on that date
    const rows: Array<{ date: string; resting_hr: number; exercised: boolean }> = [];

    for (const row of hrRows) {
      const [exRow] = await query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt
         FROM exercise_sessions
         WHERE user_id = $1
           AND DATE(started_at) = $2::date
           AND ended_at IS NOT NULL`,
        [userId, row.date]
      );
      rows.push({
        date: row.date,
        resting_hr: Number(row.resting_hr),
        exercised: parseInt(exRow?.cnt ?? "0") > 0,
      });
    }

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
