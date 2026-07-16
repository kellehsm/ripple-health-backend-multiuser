import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

const BUCKETS: Record<string, string> = {
  morning: "5 AM – 11 AM",
  afternoon: "11 AM – 4 PM",
  evening: "4 PM – 9 PM",
  night: "9 PM – 5 AM",
};

export const GlucoseTimeOfDayRule: InsightRule = {
  id: "glucose_time_of_day",
  type: "glucose",
  minDays: 14,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ bucket: string; avg_mg_dl: number; reading_count: number }>(
      `SELECT
         CASE
           WHEN EXTRACT(HOUR FROM recorded_at) >= 5  AND EXTRACT(HOUR FROM recorded_at) < 11 THEN 'morning'
           WHEN EXTRACT(HOUR FROM recorded_at) >= 11 AND EXTRACT(HOUR FROM recorded_at) < 16 THEN 'afternoon'
           WHEN EXTRACT(HOUR FROM recorded_at) >= 16 AND EXTRACT(HOUR FROM recorded_at) < 21 THEN 'evening'
           ELSE 'night'
         END AS bucket,
         ROUND(AVG(mg_dl)) AS avg_mg_dl,
         COUNT(*) AS reading_count
       FROM glucose_readings
       WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '30 days'
       GROUP BY bucket
       HAVING COUNT(*) >= 20`,
      [userId]
    );

    if (rows.length < 2) return null;

    const buckets = rows.map(r => ({ bucket: r.bucket, avg: Number(r.avg_mg_dl), count: Number(r.reading_count) }));
    buckets.sort((a, b) => b.avg - a.avg);

    const highest = buckets[0];
    const lowest  = buckets[buckets.length - 1];
    const spread  = highest.avg - lowest.avg;

    if (spread < 8) return null; // less than 8 mg/dL spread not notable

    const effectRatio = spread / 60;
    const totalReadings = buckets.reduce((s, b) => s + b.count, 0);
    const { score, label } = calcConfidence(Math.floor(totalReadings / 10), effectRatio);

    const bucketLines = buckets.map(b => `${b.bucket} (${BUCKETS[b.bucket] ?? b.bucket}): avg ${b.avg} mg/dL`).join(", ");

    return {
      title: `Glucose tends to be highest in the ${highest.bucket}`,
      description: `Over the last 30 days, your average glucose by time of day: ${bucketLines}. The ${highest.bucket} average is ${spread} mg/dL above the ${lowest.bucket} average.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: totalReadings,
      supportingData: {
        buckets,
        highest_bucket: highest.bucket,
        lowest_bucket: lowest.bucket,
        highest_avg: highest.avg,
        lowest_avg: lowest.avg,
        spread_mg_dl: spread,
      },
    };
  },
};
