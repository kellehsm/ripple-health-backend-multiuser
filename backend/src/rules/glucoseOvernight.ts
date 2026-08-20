/**
 * Overnight glucose stability vs next-day mood/energy.
 *
 * Computes per-night CV% and time-in-range from glucose_readings between
 * 00:00–06:00, then correlates with next-day mood score using lagPairColumns
 * logic applied to a per-night summary + the DayFrame.
 *
 * Tier: semiweekly.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest, formatCI, passesMDE, effectiveSampleSize } from "./stats.js";
import { query } from "../db.js";

interface NightSummary {
  night_date: string; // the calendar date of the overnight window (start)
  avg_mg_dl: number;
  cv_pct: number;
  tir: number;        // fraction 70–180 mg/dL
  n_readings: number;
}

async function getOvernightSummaries(userId: string): Promise<NightSummary[]> {
  const rows = await query<{
    night_date: string;
    avg_mg_dl: string;
    std_mg_dl: string;
    tir: string;
    n: string;
  }>(
    `SELECT
       (recorded_at AT TIME ZONE 'America/New_York')::date::text AS night_date,
       AVG(mg_dl)::float              AS avg_mg_dl,
       STDDEV(mg_dl)::float           AS std_mg_dl,
       AVG(CASE WHEN mg_dl BETWEEN 70 AND 180 THEN 1 ELSE 0 END)::float AS tir,
       COUNT(*)                       AS n
     FROM glucose_readings
     WHERE user_id = $1
       AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE 'America/New_York') < 6
       AND recorded_at >= NOW() - INTERVAL '120 days'
     GROUP BY night_date
     HAVING COUNT(*) >= 3
     ORDER BY night_date`,
    [userId]
  );

  return rows.map(r => {
    const avg = Number(r.avg_mg_dl);
    const std = Number(r.std_mg_dl);
    const cv = avg > 0 ? (std / avg) * 100 : 0;
    return {
      night_date: r.night_date,
      avg_mg_dl: avg,
      cv_pct: Number.isFinite(cv) ? cv : 0,
      tir: Number(r.tir),
      n_readings: Number(r.n),
    };
  });
}

export const GlucoseOvernightRule: InsightRule = {
  id: "glucose_overnight_mood",
  type: "glucose",
  minDays: 30,
  tier: "semiweekly",
  version: 1,
  actionable: false,
  primaryMetric: "mood_score",

  async run(userId, capabilities): Promise<InsightResult | null> {
    if (capabilities && !capabilities.has_glucose) return null;

    const nights = await getOvernightSummaries(userId);
    if (nights.length < 20) return null;

    // Build a map: date → next-day mood from daily_summaries.
    const moodRows = await query<{ date: string; mood: number }>(
      `SELECT date::text AS date,
              (summary_data->'mood'->>'averageScore')::numeric AS mood
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 121
         AND summary_data->'mood'->>'averageScore' IS NOT NULL`,
      [userId]
    );
    const moodByDate = new Map<string, number>();
    for (const r of moodRows) {
      const m = Number(r.mood);
      if (Number.isFinite(m)) moodByDate.set(r.date, m);
    }

    // Pair overnight CV with next-day mood (lag = 1 day).
    const stableCVMood: number[] = [], volCVMood: number[] = [];

    for (const night of nights) {
      const d = new Date(night.night_date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1);
      const nextDay = d.toISOString().slice(0, 10);
      const mood = moodByDate.get(nextDay);
      if (mood == null) continue;

      if (night.cv_pct <= 15) {
        stableCVMood.push(mood);      // ≤15% CV = stable night
      } else if (night.cv_pct >= 25) {
        volCVMood.push(mood);         // ≥25% CV = variable night
      }
    }

    if (stableCVMood.length < 8 || volCVMood.length < 8) return null;

    const effN = effectiveSampleSize(stableCVMood);
    const t = welchTTest(stableCVMood, volCVMood, effN);
    if (t.pValue > 0.1) return null;
    if (!passesMDE("mood_score", Math.abs(t.meanA - t.meanB))) return null;

    const diff = t.meanA - t.meanB;
    const dir = diff > 0 ? "higher" : "lower";
    const ciStr = t.ci95 ? ` ${formatCI(t.ci95, 2)}.` : "";

    return {
      title: `Next-day mood appears ${dir} after stable overnight glucose`,
      description:
        `On ${stableCVMood.length} mornings following a low-variation overnight glucose window (CV ≤15%), ` +
        `average next-day mood was ${t.meanA.toFixed(1)}/5 ` +
        `vs ${t.meanB.toFixed(1)}/5 after ${volCVMood.length} higher-variation nights (CV ≥25%).${ciStr}`,
      confidence: t.pValue < 0.05 ? "high" : "moderate",
      confidenceScore: Math.round(Math.min(85, 35 + Math.abs(t.effectSize) * 40 + Math.min(stableCVMood.length, 20))),
      timesObserved: stableCVMood.length + volCVMood.length,
      pValue: t.pValue,
      effectSize: t.effectSize,
      ci95: t.ci95,
      supportingData: {
        stable_nights: stableCVMood.length,
        variable_nights: volCVMood.length,
        avg_mood_stable_nights: Number(t.meanA.toFixed(2)),
        avg_mood_variable_nights: Number(t.meanB.toFixed(2)),
        difference: Number(diff.toFixed(2)),
        direction: dir,
        p_value: Number(t.pValue.toFixed(3)),
        overnight_window: "00:00-06:00",
        cv_stable_threshold_pct: 15,
        cv_variable_threshold_pct: 25,
      },
    };
  },
};
