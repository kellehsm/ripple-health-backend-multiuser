import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";
import { avgOf } from "./ruleHelper.js";

const LOOKBACK_DAYS = 120;

export const ChallengeActivityBoostRule: InsightRule = {
  id: "challenge_activity_boost",
  type: "exercise",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    // Get all challenge weeks (ISO weeks where the user had an active challenge)
    // and compare average daily steps vs non-challenge weeks.
    const rows = await query<{
      week_start: string;
      avg_steps: string;
      has_challenge: boolean;
    }>(
      `WITH date_series AS (
         SELECT generate_series(
           (CURRENT_DATE - ${LOOKBACK_DAYS})::date,
           CURRENT_DATE,
           '1 day'::interval
         )::date AS day
       ),
       challenge_days AS (
         SELECT DISTINCT ds_inner.day
         FROM date_series ds_inner
         JOIN challenges c ON c.start_date <= ds_inner.day AND c.end_date >= ds_inner.day
         JOIN challenge_participants cp ON cp.challenge_id = c.id AND cp.user_id = $1
         WHERE c.status IN ('active', 'completed')
       ),
       steps_daily AS (
         SELECT
           DATE(logged_at AT TIME ZONE 'America/New_York') AS day,
           SUM(value) AS steps
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1
           AND m.name = 'steps'
           AND logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
         GROUP BY DATE(logged_at AT TIME ZONE 'America/New_York')
         UNION ALL
         SELECT
           DATE(logged_at AT TIME ZONE 'America/New_York') AS day,
           SUM(step_count) AS steps
         FROM exercise_logs
         WHERE user_id = $1
           AND step_count IS NOT NULL
           AND logged_at >= CURRENT_DATE - ${LOOKBACK_DAYS}
         GROUP BY DATE(logged_at AT TIME ZONE 'America/New_York')
       ),
       steps_agg AS (
         SELECT day, SUM(steps) AS steps FROM steps_daily GROUP BY day
       ),
       weekly AS (
         SELECT
           DATE_TRUNC('week', sa.day)::date AS week_start,
           AVG(sa.steps) AS avg_steps,
           BOOL_OR(cd.day IS NOT NULL) AS has_challenge
         FROM steps_agg sa
         LEFT JOIN challenge_days cd ON cd.day = sa.day
         GROUP BY DATE_TRUNC('week', sa.day)
         HAVING COUNT(*) >= 3
       )
       SELECT
         week_start::text,
         avg_steps::text,
         has_challenge
       FROM weekly
       ORDER BY week_start DESC`,
      [userId]
    );

    if (rows.length < 6) return null;

    const challengeWeeks   = rows.filter(r => r.has_challenge);
    const noChallengeWeeks = rows.filter(r => !r.has_challenge);

    if (challengeWeeks.length < 2 || noChallengeWeeks.length < 4) return null;

    const avgStepsChallenge   = avgOf(challengeWeeks,   r => Number(r.avg_steps));
    const avgStepsNoChallenge = avgOf(noChallengeWeeks, r => Number(r.avg_steps));

    const diff = avgStepsChallenge - avgStepsNoChallenge;
    // Only surface if at least 500-step difference
    if (Math.abs(diff) < 500) return null;

    const direction = diff > 0 ? "higher" : "lower";
    const effectRatio = Math.abs(diff) / Math.max(avgStepsChallenge, avgStepsNoChallenge);
    const { score, label } = calcConfidence(
      Math.min(challengeWeeks.length, noChallengeWeeks.length),
      effectRatio
    );

    const pctChange = ((Math.abs(diff) / avgStepsNoChallenge) * 100).toFixed(0);

    return {
      title: `Your daily steps tend to be ${direction} during challenge weeks`,
      description: `Across ${challengeWeeks.length} weeks with an active challenge you averaged ${Math.round(avgStepsChallenge).toLocaleString()} steps/day, compared to ${Math.round(avgStepsNoChallenge).toLocaleString()} steps/day across ${noChallengeWeeks.length} non-challenge weeks — about ${pctChange}% ${direction}.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      primaryMetric: "steps",
      supportingData: {
        weeks_analyzed: rows.length,
        challenge_weeks: challengeWeeks.length,
        no_challenge_weeks: noChallengeWeeks.length,
        avg_steps_challenge_weeks: Math.round(avgStepsChallenge),
        avg_steps_no_challenge_weeks: Math.round(avgStepsNoChallenge),
        step_difference: Math.round(Math.abs(diff)),
        pct_change: pctChange,
        direction,
      },
    };
  },
};
