import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const ExerciseVsMoodRule: InsightRule = {
  id: "exercise_vs_mood",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Get all days in last 60 days that have mood data
    const moodRows = await query<{ date: string; avg_mood: number }>(
      `SELECT
         date::text AS date,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 60
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY date DESC`,
      [userId]
    );

    if (moodRows.length < 16) return null;

    // For each mood day, check whether a completed exercise session exists
    const rows: Array<{ date: string; avg_mood: number; exercised: boolean }> = [];

    for (const row of moodRows) {
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
        avg_mood: Number(row.avg_mood),
        exercised: parseInt(exRow?.cnt ?? "0") > 0,
      });
    }

    const exerciseDays   = rows.filter(r => r.exercised);
    const noExerciseDays = rows.filter(r => !r.exercised);

    if (exerciseDays.length < 8 || noExerciseDays.length < 8) return null;

    const avgMoodExercise   = exerciseDays.reduce((s, r) => s + r.avg_mood, 0) / exerciseDays.length;
    const avgMoodNoExercise = noExerciseDays.reduce((s, r) => s + r.avg_mood, 0) / noExerciseDays.length;

    const diff = avgMoodExercise - avgMoodNoExercise;
    if (Math.abs(diff) < 0.2) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(
      Math.min(exerciseDays.length, noExerciseDays.length),
      effectRatio
    );

    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Mood tends to be ${direction} on days you exercise`,
      description: `Over the last 60 days, on the ${exerciseDays.length} days with a completed workout your average mood was ${avgMoodExercise.toFixed(1)}/5, compared to ${avgMoodNoExercise.toFixed(1)}/5 on the ${noExerciseDays.length} days without exercise — a difference of ${Math.abs(diff).toFixed(1)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        exercise_days: exerciseDays.length,
        no_exercise_days: noExerciseDays.length,
        avg_mood_exercise: avgMoodExercise.toFixed(2),
        avg_mood_no_exercise: avgMoodNoExercise.toFixed(2),
        mood_difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
