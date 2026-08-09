import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Which time of day accounts for the largest share of total spend? Surfaces
// impulse-window ("42% of your spending happens after 8pm") which is often
// the highest-lift behavioral hook.
export const TimeOfDaySpendRule: InsightRule = {
  id: "time_of_day_spend",
  type: "finance",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ bucket: string; total: number; n: number }>(
      `SELECT
         CASE
           WHEN EXTRACT(HOUR FROM logged_at) BETWEEN 5 AND 10 THEN 'morning'
           WHEN EXTRACT(HOUR FROM logged_at) BETWEEN 11 AND 15 THEN 'midday'
           WHEN EXTRACT(HOUR FROM logged_at) BETWEEN 16 AND 20 THEN 'evening'
           ELSE 'late night'
         END AS bucket,
         SUM(amount)::float8 AS total,
         COUNT(*)::int AS n
       FROM spending_entries
       WHERE user_id = $1
         AND logged_at >= NOW() - INTERVAL '60 days'
       GROUP BY 1
       HAVING COUNT(*) >= 3`,
      [userId]
    );

    if (rows.length < 2) return null;

    const grand = rows.reduce((s, r) => s + Number(r.total), 0);
    if (grand <= 0) return null;

    const shares = rows.map((r) => ({ bucket: r.bucket, share: Number(r.total) / grand, total: Number(r.total), n: r.n }));
    shares.sort((a, b) => b.share - a.share);
    const top = shares[0];
    if (top.share < 0.35) return null;

    const totalN = rows.reduce((s, r) => s + r.n, 0);
    const { score, label } = calcConfidence(totalN, Math.min(1, (top.share - 0.25) / 0.5));

    return {
      title: `${Math.round(top.share * 100)}% of your spending happens in the ${top.bucket}`,
      description: `Across ${totalN} spending entries over 60 days, the ${top.bucket} window accounts for $${top.total.toFixed(0)} out of $${grand.toFixed(0)} total — the largest share of any time-of-day bucket.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: totalN,
      supportingData: {
        buckets: shares.map((s) => ({
          bucket: s.bucket,
          total_dollars: s.total.toFixed(2),
          share_pct: Math.round(s.share * 100),
          entries: s.n,
        })),
        peak_bucket: top.bucket,
        peak_share_pct: Math.round(top.share * 100),
      },
    };
  },
};
