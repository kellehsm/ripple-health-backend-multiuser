import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Splits mood entries into 4 time-of-day buckets (morning 5-11, midday 11-16,
// evening 16-21, night 21-5) and flags if there's a meaningful spread (>0.5
// point on the 1-5 scale).
export const TimeOfDayMoodRule: InsightRule = {
  id: "time_of_day_mood",
  type: "mood",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ bucket: string; avg_mood: number; n: number }>(
      `SELECT
         CASE
           WHEN EXTRACT(HOUR FROM logged_at) BETWEEN 5 AND 10 THEN 'morning'
           WHEN EXTRACT(HOUR FROM logged_at) BETWEEN 11 AND 15 THEN 'midday'
           WHEN EXTRACT(HOUR FROM logged_at) BETWEEN 16 AND 20 THEN 'evening'
           ELSE 'night'
         END AS bucket,
         AVG(mood_score)::float8 AS avg_mood,
         COUNT(*)::int AS n
       FROM journal_entries
       WHERE user_id = $1
         AND mood_score IS NOT NULL
         AND logged_at >= NOW() - INTERVAL '60 days'
       GROUP BY 1
       HAVING COUNT(*) >= 5`,
      [userId]
    );

    if (rows.length < 3) return null;

    const sorted = [...rows].sort((a, b) => Number(a.avg_mood) - Number(b.avg_mood));
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    const spread = Number(highest.avg_mood) - Number(lowest.avg_mood);
    if (spread < 0.5) return null;

    const totalN = rows.reduce((s, r) => s + r.n, 0);
    const effectRatio = Math.min(1, spread / 2);
    const { score, label } = calcConfidence(totalN, effectRatio);

    return {
      title: `Your mood tends to be highest in the ${highest.bucket}`,
      description: `Across ${totalN} mood entries in the last 60 days, your average was ${Number(highest.avg_mood).toFixed(1)}/5 in the ${highest.bucket} and ${Number(lowest.avg_mood).toFixed(1)}/5 in the ${lowest.bucket} — a ${spread.toFixed(1)}-point spread.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: totalN,
      supportingData: {
        buckets: rows.map((r) => ({ bucket: r.bucket, avg_mood: Number(r.avg_mood).toFixed(2), entries: r.n })),
        best_bucket: highest.bucket,
        worst_bucket: lowest.bucket,
        spread: spread.toFixed(2),
      },
    };
  },
};
