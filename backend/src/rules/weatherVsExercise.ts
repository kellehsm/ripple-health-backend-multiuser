import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

const BRIGHT = new Set(["Clear", "Sunny", "Mostly Clear"]);
const GREY   = new Set(["Rain", "Rainy", "Drizzle", "Snow", "Snowy", "Clouds", "Cloudy", "Overcast", "Thunderstorm"]);

// Do you exercise less when it's rainy/cloudy? Common but often unnoticed
// pattern — surface as a heads-up for indoor-workout planning.
export const WeatherVsExerciseRule: InsightRule = {
  id: "weather_vs_exercise",
  type: "exercise",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; weather: string; had_ex: boolean }>(
      `SELECT
         ds.date::text AS date,
         ds.weather_condition AS weather,
         EXISTS (SELECT 1 FROM exercise_sessions es WHERE es.user_id = ds.user_id AND es.started_at::date = ds.date) AS had_ex
       FROM daily_summaries ds
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 90
         AND ds.weather_condition IS NOT NULL`,
      [userId]
    );

    if (rows.length < 30) return null;

    const bright = rows.filter((r) => BRIGHT.has(r.weather));
    const grey   = rows.filter((r) => GREY.has(r.weather));
    if (bright.length < 8 || grey.length < 8) return null;

    const pctBright = bright.filter((r) => r.had_ex).length / bright.length;
    const pctGrey   = grey.filter((r) => r.had_ex).length / grey.length;
    const diff = pctBright - pctGrey;
    if (Math.abs(diff) < 0.15) return null; // <15 pp = noise

    const effectRatio = Math.min(1, Math.abs(diff) / 0.4);
    const { score, label } = calcConfidence(Math.min(bright.length, grey.length), effectRatio);
    const direction = diff > 0 ? "less" : "more";

    return {
      title: `You exercise ${direction} on cloudy/rainy days`,
      description: `You worked out on ${Math.round(pctBright * 100)}% of bright/clear days but only ${Math.round(pctGrey * 100)}% of grey/rainy days — a gap of ${Math.round(Math.abs(diff) * 100)} percentage points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        bright_days: bright.length,
        grey_days: grey.length,
        exercise_rate_bright: Math.round(pctBright * 100),
        exercise_rate_grey: Math.round(pctGrey * 100),
        gap_pct_points: Math.round(Math.abs(diff) * 100),
      },
    };
  },
};
