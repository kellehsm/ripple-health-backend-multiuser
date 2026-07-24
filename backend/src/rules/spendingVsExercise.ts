import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

const FIXED_CATEGORIES = [
  'Rent / Mortgage',
  'Utilities',
  'Home',
  'Health',
  'health',
  'subscriptions',
  'Subscriptions',
  'income / transfer',
  'Income / Transfer',
];

export const SpendingVsExerciseRule: InsightRule = {
  id: "spending_vs_exercise",
  type: "spending",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; total: number; exercised: boolean }>(
      `WITH spend AS (
         SELECT
           logged_at::date AS day,
           SUM(amount) AS total
         FROM spending_entries
         WHERE user_id = $1
           AND logged_at >= CURRENT_DATE - 60
           AND category NOT IN (${FIXED_CATEGORIES.map((_, i) => `$${i + 2}`).join(", ")})
         GROUP BY logged_at::date
       ),
       ex_days AS (
         SELECT DISTINCT started_at::date AS day
         FROM exercise_sessions
         WHERE user_id = $1
           AND started_at >= CURRENT_DATE - 60
           AND ended_at IS NOT NULL
       )
       SELECT
         s.day::text AS date,
         s.total,
         (ex.day IS NOT NULL) AS exercised
       FROM spend s
       LEFT JOIN ex_days ex ON ex.day = s.day
       ORDER BY s.day DESC`,
      [userId, ...FIXED_CATEGORIES]
    );

    if (rows.length < 21) return null;

    const exerciseDays  = rows.filter(r => r.exercised);
    const noExerciseDays = rows.filter(r => !r.exercised);

    if (exerciseDays.length < 5 || noExerciseDays.length < 5) return null;

    const avgExercise   = exerciseDays.reduce((s, r) => s + r.total, 0) / exerciseDays.length;
    const avgNoExercise = noExerciseDays.reduce((s, r) => s + r.total, 0) / noExerciseDays.length;

    const diff = avgNoExercise - avgExercise; // positive = higher on no-exercise days
    if (Math.abs(diff) < 2) return null;

    const refAmount = Math.max(avgExercise, avgNoExercise, 1);
    const effectRatio = Math.abs(diff) / refAmount;
    const { score, label } = calcConfidence(
      Math.min(exerciseDays.length, noExerciseDays.length),
      effectRatio
    );

    const higherOn = diff > 0 ? "without exercise" : "with exercise";
    const lowerOn  = diff > 0 ? "with exercise" : "without exercise";
    const absDiff  = Math.abs(diff);

    return {
      title: `Spending tends to be higher on days ${higherOn}`,
      description: `Over the last 60 days, your average daily impulse spending was $${avgExercise.toFixed(0)} on days with a completed workout and $${avgNoExercise.toFixed(0)} on days without — a difference of about $${absDiff.toFixed(0)}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        exercise_days: exerciseDays.length,
        no_exercise_days: noExerciseDays.length,
        avg_spend_exercise: avgExercise.toFixed(2),
        avg_spend_no_exercise: avgNoExercise.toFixed(2),
        difference_dollars: absDiff.toFixed(2),
        higher_on: higherOn,
        lower_on: lowerOn,
      },
    };
  },
};
