import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

const FIXED_CATEGORIES = [
  'Rent / Mortgage',
  'Utilities',
  'Home',
  'Health',
  'health',
  'Subscriptions',
  'subscriptions',
  'Income / Transfer',
];

export const HobbiesVsSpendingRule: InsightRule = {
  id: "hobbies_vs_spending",
  type: "combined",
  minDays: 21,

  async run(userId: string): Promise<InsightResult | null> {
    // Get all days in last 60 days that have hobby session data from daily_summaries
    const hobbyRows = await query<{ date: string; hobby_sessions: number }>(
      `SELECT
         date::text AS date,
         COALESCE((summary_data->'productivity'->>'hobbySessions')::numeric, 0) AS hobby_sessions
       FROM daily_summaries
       WHERE user_id = $1
         AND date >= CURRENT_DATE - 60
       ORDER BY date DESC`,
      [userId]
    );

    if (hobbyRows.length < 8) return null;

    // Get impulse spending per day (excluding fixed/recurring categories)
    const spendRows = await query<{ date: string; total: number }>(
      `SELECT
         logged_at::date::text AS date,
         SUM(amount) AS total
       FROM spending_entries
       WHERE user_id = $1
         AND logged_at >= CURRENT_DATE - 60
         AND (category IS NULL OR category NOT IN (${FIXED_CATEGORIES.map((_, i) => `$${i + 2}`).join(", ")}))
       GROUP BY logged_at::date`,
      [userId, ...FIXED_CATEGORIES]
    );

    const spendMap = new Map<string, number>(spendRows.map(r => [r.date, Number(r.total)]));

    // Only include days that have spend > 0
    const hobbyDays: number[]    = [];
    const noHobbyDays: number[]  = [];

    for (const row of hobbyRows) {
      const spend = spendMap.get(row.date);
      if (spend == null || spend <= 0) continue;

      if (Number(row.hobby_sessions) > 0) {
        hobbyDays.push(spend);
      } else {
        noHobbyDays.push(spend);
      }
    }

    if (hobbyDays.length < 4 || noHobbyDays.length < 4) return null;

    const avgSpendHobby   = hobbyDays.reduce((s, v) => s + v, 0) / hobbyDays.length;
    const avgSpendNoHobby = noHobbyDays.reduce((s, v) => s + v, 0) / noHobbyDays.length;

    // diff > 0 means spending is higher on no-hobby days
    const diff = avgSpendNoHobby - avgSpendHobby;
    if (Math.abs(diff) < 2) return null;

    const refAmount = Math.max(avgSpendHobby, avgSpendNoHobby, 1);
    const effectRatio = Math.abs(diff) / refAmount;
    const { score, label } = calcConfidence(
      Math.min(hobbyDays.length, noHobbyDays.length),
      effectRatio
    );

    // direction describes spending on hobby days relative to non-hobby days
    const direction = diff > 0 ? "lower" : "higher";

    return {
      title: `Spending tends to be ${direction} on days with hobby activity`,
      description: `Over the last 60 days, on the ${hobbyDays.length} days with a hobby session your average impulse spending was $${avgSpendHobby.toFixed(0)}, compared to $${avgSpendNoHobby.toFixed(0)} on the ${noHobbyDays.length} days without hobby activity — a difference of about $${Math.abs(diff).toFixed(0)}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: hobbyDays.length + noHobbyDays.length,
      supportingData: {
        hobby_days_with_spend: hobbyDays.length,
        no_hobby_days_with_spend: noHobbyDays.length,
        avg_spend_hobby_days: avgSpendHobby.toFixed(2),
        avg_spend_no_hobby_days: avgSpendNoHobby.toFixed(2),
        difference_dollars: Math.abs(diff).toFixed(2),
        direction,
      },
    };
  },
};
