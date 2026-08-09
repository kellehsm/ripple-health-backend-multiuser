import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// True HRV needs RR-interval data we don't have. Best proxy from bulk HR
// readings: intra-day BPM standard deviation (higher SD ~ more autonomic
// flexibility during rest). Correlate daytime HR-SD with THAT NIGHT'S sleep
// quality — higher-SD days should predict better recovery.
export const HrvVsSleepRule: InsightRule = {
  id: "hrv_vs_sleep",
  type: "sleep",
  minDays: 30,

  async run(userId: string, capabilities?): Promise<InsightResult | null> {
    if (!capabilities?.has_hr) return null;

    const rows = await query<{ date: string; hr_sd: number; sleep_quality: number }>(
      `WITH daytime_hr AS (
        SELECT recorded_at::date AS day,
               STDDEV_SAMP(bpm)::float8 AS hr_sd
        FROM heart_rate_readings
        WHERE user_id = $1
          AND recorded_at >= NOW() - INTERVAL '60 days'
          AND EXTRACT(HOUR FROM recorded_at) BETWEEN 8 AND 20
        GROUP BY recorded_at::date
        HAVING COUNT(*) >= 20
      )
      SELECT dh.day::text AS date,
             dh.hr_sd,
             (ds.summary_data->'sleep'->>'averageQuality')::numeric AS sleep_quality
      FROM daytime_hr dh
      JOIN daily_summaries ds ON ds.user_id = $1 AND ds.date = dh.day
      WHERE ds.summary_data->'sleep'->>'averageQuality' IS NOT NULL`,
      [userId]
    );

    if (rows.length < 21) return null;

    // Sort by HR SD, take top-tertile and bottom-tertile.
    const sorted = [...rows].sort((a, b) => Number(a.hr_sd) - Number(b.hr_sd));
    const cut = Math.floor(sorted.length / 3);
    const lowSD  = sorted.slice(0, cut);
    const highSD = sorted.slice(sorted.length - cut);
    if (lowSD.length < 5 || highSD.length < 5) return null;

    const mean = (a: typeof rows) => a.reduce((s, r) => s + Number(r.sleep_quality), 0) / a.length;
    const qLow  = mean(lowSD);
    const qHigh = mean(highSD);
    const diff  = qHigh - qLow;
    if (Math.abs(diff) < 3) return null;

    const effectRatio = Math.min(1, Math.abs(diff) / 20);
    const { score, label } = calcConfidence(Math.min(lowSD.length, highSD.length), effectRatio);
    const direction = diff > 0 ? "better" : "worse";

    return {
      title: `Higher heart-rate variability days link to ${direction} sleep`,
      description: `On days when your daytime HR was more variable (top tertile), that night's sleep quality averaged ${qHigh.toFixed(0)}/100, compared to ${qLow.toFixed(0)}/100 on lower-variability days — a difference of ${Math.abs(diff).toFixed(0)} points.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        high_sd_days: highSD.length,
        low_sd_days: lowSD.length,
        avg_quality_high_sd: qHigh.toFixed(1),
        avg_quality_low_sd: qLow.toFixed(1),
        difference: diff.toFixed(1),
        note: "Uses daytime BPM standard deviation as a proxy for HRV",
      },
    };
  },
};
