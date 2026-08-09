import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Mood on sunny/clear vs cloudy/rainy days. Uses daily_summaries.weather_condition
// (string like "Clear", "Rain", "Clouds", "Snow"). We treat Clear/Sun as
// "bright" and Rain/Snow/Drizzle/Clouds as "grey" — everything else ignored.
const BRIGHT = new Set(["Clear", "Sunny", "Mostly Clear"]);
const GREY   = new Set(["Rain", "Rainy", "Drizzle", "Snow", "Snowy", "Clouds", "Cloudy", "Overcast", "Thunderstorm"]);

export const WeatherVsMoodRule: InsightRule = {
  id: "weather_vs_mood",
  type: "mood",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; weather: string; avg_mood: number }>(
      `SELECT
         date::text AS date,
         weather_condition AS weather,
         (summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 90
         AND weather_condition IS NOT NULL
         AND summary_data->'mood'->>'averageScore' IS NOT NULL`,
      [userId]
    );

    if (rows.length < 30) return null;

    const bright = rows.filter((r) => BRIGHT.has(r.weather));
    const grey   = rows.filter((r) => GREY.has(r.weather));
    if (bright.length < 6 || grey.length < 6) return null;

    const mean = (a: typeof rows) => a.reduce((s, r) => s + Number(r.avg_mood), 0) / a.length;
    const moodBright = mean(bright);
    const moodGrey   = mean(grey);
    const diff = moodBright - moodGrey;
    if (Math.abs(diff) < 0.25) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(Math.min(bright.length, grey.length), effectRatio);
    const direction = diff > 0 ? "brighter" : "greyer";

    return {
      title: `Your mood tends to be higher on ${direction} days`,
      description: `On sunny/clear days your average mood was ${moodBright.toFixed(1)}/5, compared to ${moodGrey.toFixed(1)}/5 on cloudy/rainy days — a difference of ${Math.abs(diff).toFixed(2)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        bright_days: bright.length,
        grey_days: grey.length,
        avg_mood_bright: moodBright.toFixed(2),
        avg_mood_grey: moodGrey.toFixed(2),
        mood_difference: diff.toFixed(2),
      },
    };
  },
};
