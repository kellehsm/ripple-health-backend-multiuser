import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Finds the most common two-symptom pair the user logs together. E.g.
// "cramps + headache appear together on 7 of 12 cramps days". Surfaces
// hidden pattern in cycle_day_logs.symptoms[] that no single-symptom rule
// would catch.
export const SymptomClustersRule: InsightRule = {
  id: "symptom_clusters",
  type: "cycle",
  minDays: 30,

  async run(userId: string, capabilities?): Promise<InsightResult | null> {
    if (!capabilities?.has_cycle) return null;

    const rows = await query<{ symptoms: string[] }>(
      `SELECT symptoms
       FROM cycle_day_logs
       WHERE user_id = $1
         AND log_date >= CURRENT_DATE - 120
         AND symptoms IS NOT NULL
         AND array_length(symptoms, 1) >= 2`,
      [userId]
    );

    if (rows.length < 10) return null;

    // Count each pair (unordered).
    const pairCounts = new Map<string, number>();
    const singleCounts = new Map<string, number>();
    for (const row of rows) {
      const set = Array.from(new Set(row.symptoms.map((s) => s.toLowerCase())));
      for (const s of set) singleCounts.set(s, (singleCounts.get(s) ?? 0) + 1);
      for (let i = 0; i < set.length; i++) {
        for (let j = i + 1; j < set.length; j++) {
          const key = [set[i], set[j]].sort().join("|");
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }
    if (pairCounts.size === 0) return null;

    // Pick the pair with the highest lift = P(both) / (P(a) * P(b))
    let best: { pair: [string, string]; count: number; lift: number } | null = null;
    const totalDays = rows.length;
    for (const [key, count] of pairCounts.entries()) {
      const [a, b] = key.split("|");
      const pA = (singleCounts.get(a) ?? 0) / totalDays;
      const pB = (singleCounts.get(b) ?? 0) / totalDays;
      const pBoth = count / totalDays;
      const expected = pA * pB;
      if (expected === 0) continue;
      const lift = pBoth / expected;
      if (count < 4) continue;
      if (!best || lift > best.lift) best = { pair: [a, b], count, lift };
    }
    if (!best || best.lift < 1.3) return null; // lift <1.3 = weak co-occurrence

    const cA = singleCounts.get(best.pair[0]) ?? 0;
    const cB = singleCounts.get(best.pair[1]) ?? 0;
    const jointPct = Math.round((best.count / Math.min(cA, cB)) * 100);
    const { score, label } = calcConfidence(best.count * 3, Math.min(1, (best.lift - 1) / 2));

    return {
      title: `${best.pair[0]} + ${best.pair[1]} often appear together`,
      description: `You've logged ${best.pair[0]} and ${best.pair[1]} on the same day ${best.count} times across the last 120 days — ${jointPct}% of the days you had one, you had the other. That's ${best.lift.toFixed(1)}x the rate expected by chance.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: totalDays,
      supportingData: {
        pair: best.pair,
        co_occurrences: best.count,
        symptom_a_total: cA,
        symptom_b_total: cB,
        lift: best.lift.toFixed(2),
      },
    };
  },
};
