import { query } from "../db.js";
import { InsightRule, InsightResult } from "./types.js";

function streakInsight(streakType: string, count: number, unit: string, motivation: string): InsightResult {
  const confidenceScore = Math.min(100, count * 5);
  const confidence = confidenceScore >= 75 ? "very_high" : confidenceScore >= 50 ? "high" : confidenceScore >= 25 ? "moderate" : "low";
  return {
    title: `${count}-${unit} ${streakType} streak`,
    description: motivation,
    confidence,
    confidenceScore,
    timesObserved: count,
    supportingData: { streak_days: count, streak_type: streakType },
  };
}

export const MealStreakRule: InsightRule = {
  id: "meal_logging_streak",
  type: "streak",
  minDays: 3,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ day: string }>(
      `SELECT DISTINCT logged_at::date AS day FROM meals
       WHERE user_id = $1 AND logged_at >= CURRENT_DATE - 90
       ORDER BY day DESC`,
      [userId]
    );

    const days = rows.map(r => (String(r.day).slice(0, 10)));
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (!days.length || (days[0] !== today && days[0] !== yesterday)) return null;

    let streak = 0;
    let expected = days[0];
    for (const day of days) {
      if (day === expected) {
        streak++;
        const d = new Date(expected + "T12:00:00");
        d.setDate(d.getDate() - 1);
        expected = d.toISOString().slice(0, 10);
      } else break;
    }

    if (streak < 3) return null;

    return streakInsight(
      "meal logging",
      streak,
      "day",
      `You've logged meals every day for the last ${streak} days. Consistent tracking is one of the strongest predictors of long-term habit awareness.`
    );
  },
};

export const WaterStreakRule: InsightRule = {
  id: "water_logging_streak",
  type: "streak",
  minDays: 3,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ day: string }>(
      `SELECT DISTINCT ml.logged_at::date AS day
       FROM metric_logs ml
       JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'water'
         AND ml.logged_at >= CURRENT_DATE - 90
       ORDER BY day DESC`,
      [userId]
    );

    const days = rows.map(r => (String(r.day).slice(0, 10)));
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (!days.length || (days[0] !== today && days[0] !== yesterday)) return null;

    let streak = 0;
    let expected = days[0];
    for (const day of days) {
      if (day === expected) {
        streak++;
        const d = new Date(expected + "T12:00:00");
        d.setDate(d.getDate() - 1);
        expected = d.toISOString().slice(0, 10);
      } else break;
    }

    if (streak < 3) return null;

    return streakInsight(
      "water tracking",
      streak,
      "day",
      `You've logged water every day for ${streak} consecutive days. Staying consistent with hydration tracking is often associated with better actual intake over time.`
    );
  },
};

export const StepGoalStreakRule: InsightRule = {
  id: "step_goal_streak",
  type: "streak",
  minDays: 3,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ day: string; steps: number }>(
      `SELECT
         logged_at::date AS day,
         MAX(value) AS steps
       FROM metric_logs ml
       JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'steps'
         AND ml.logged_at >= CURRENT_DATE - 60
       GROUP BY logged_at::date
       ORDER BY day DESC`,
      [userId]
    );

    const TARGET = 8000;
    const qualifyingDays = rows
      .filter(r => Number(r.steps) >= TARGET)
      .map(r => (String(r.day).slice(0, 10)));

    if (!qualifyingDays.length) return null;

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (qualifyingDays[0] !== today && qualifyingDays[0] !== yesterday) return null;

    let streak = 0;
    let expected = qualifyingDays[0];
    for (const day of qualifyingDays) {
      if (day === expected) {
        streak++;
        const d = new Date(expected + "T12:00:00");
        d.setDate(d.getDate() - 1);
        expected = d.toISOString().slice(0, 10);
      } else break;
    }

    if (streak < 3) return null;

    return streakInsight(
      "step goal",
      streak,
      "day",
      `You've hit ${TARGET.toLocaleString()}+ steps for ${streak} days in a row. Sustained activity patterns like this tend to show up positively across your other metrics.`
    );
  },
};
