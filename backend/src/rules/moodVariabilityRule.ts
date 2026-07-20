import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const MoodVariabilityRule: InsightRule = {
  id: "mood_variability",
  type: "mood",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ avg_mood: number }>(
      `SELECT (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 60
         AND summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY date DESC`,
      [userId]
    );

    if (rows.length < 20) return null;

    const moods = rows.map(r => Number(r.avg_mood));
    const n = moods.length;
    const mean = moods.reduce((s, v) => s + v, 0) / n;
    const variance = moods.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
    const stddev = Math.sqrt(variance);

    let title: string;
    let description: string;
    let effectRatio: number;

    if (stddev > 1.2) {
      title = "Your mood has been quite variable lately";
      description = `Over the last 60 days, your daily mood scores have had a standard deviation of ${stddev.toFixed(2)} points — suggesting notable day-to-day variation in how you're feeling.`;
      effectRatio = Math.min(1, Math.max(0, (stddev - 0.8) / 1.2));
    } else if (stddev < 0.5 && mean > 3.5) {
      title = "Your mood has been consistently positive lately";
      description = `Over the last 60 days, your mood has stayed close to ${mean.toFixed(1)}/5 with little variation — a sign of sustained positive wellbeing.`;
      effectRatio = Math.min(1, Math.max(0, (0.8 - stddev) / 0.8));
    } else if (stddev < 0.5 && mean <= 3.5) {
      title = "Your mood has been consistently low lately — it may be worth reflecting on what's been weighing on you";
      description = `Over the last 60 days, your mood has averaged ${mean.toFixed(1)}/5 with little variation. Sustained low mood can be worth paying attention to.`;
      effectRatio = Math.min(1, Math.max(0, (0.8 - stddev) / 0.8));
    } else {
      return null;
    }

    const { score, label } = calcConfidence(n, effectRatio);

    return {
      title,
      description,
      confidence: label,
      confidenceScore: score,
      timesObserved: n,
      supportingData: {
        stddev: stddev.toFixed(3),
        avg_mood: mean.toFixed(2),
        days_analyzed: n,
      },
    };
  },
};
