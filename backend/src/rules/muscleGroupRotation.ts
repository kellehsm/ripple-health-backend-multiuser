import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Flags any muscle group that's been trained ≥3 times in the last 60 days
// but hasn't been trained in the last 21. E.g. "legs — you trained them 8x
// in Sep but not once in the last 3 weeks".
export const MuscleGroupRotationRule: InsightRule = {
  id: "muscle_group_rotation",
  type: "exercise",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ muscle: string; sixty_day_count: number; days_since_last: number | null }>(
      `WITH exercise_muscles AS (
        SELECT UNNEST(e.primary_muscles) AS muscle,
               es.started_at::date AS day
        FROM exercise_sessions es
        JOIN exercise_log_entries ele ON ele.session_id = es.id
        JOIN exercises e ON e.id = ele.exercise_id
        WHERE es.user_id = $1
          AND es.started_at >= NOW() - INTERVAL '60 days'
      )
      SELECT muscle,
             COUNT(DISTINCT day)::int AS sixty_day_count,
             (CURRENT_DATE - MAX(day))::int AS days_since_last
      FROM exercise_muscles
      GROUP BY muscle
      HAVING COUNT(DISTINCT day) >= 3
         AND (CURRENT_DATE - MAX(day)) >= 21
      ORDER BY days_since_last DESC
      LIMIT 3`,
      [userId]
    );

    if (rows.length === 0) return null;

    const top = rows[0];
    const others = rows.slice(1).map((r) => r.muscle).join(", ");
    const tail = others ? ` Also: ${others}.` : "";

    const { score, label } = calcConfidence(top.sixty_day_count * 4, Math.min(1, (top.days_since_last ?? 0) / 60));

    return {
      title: `You haven't trained ${top.muscle} in ${top.days_since_last} days`,
      description: `You trained ${top.muscle} ${top.sixty_day_count} times over the last 60 days, but not once in the last ${top.days_since_last}.${tail} Rotating back in helps balance and prevents imbalances.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        muscle: top.muscle,
        sixty_day_count: top.sixty_day_count,
        days_since_last: top.days_since_last,
        other_underutilized: rows.slice(1).map((r) => ({ muscle: r.muscle, days_since_last: r.days_since_last })),
      },
    };
  },
};
