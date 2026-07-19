import { query } from "../db.js";
import { InsightRule, InsightResult } from "./types.js";

export const UndertrainedMuscleRule: InsightRule = {
  id: "undertrained_muscle_group",
  type: "exercise",
  minDays: 14,

  async run(userId: string): Promise<InsightResult | null> {
    // Get last session date and 60-day frequency per primary muscle group
    const rows = await query<{ muscle: string; last_date: string; appearances: string }>(
      `SELECT
         m.muscle,
         MAX(DATE(es.started_at AT TIME ZONE 'America/New_York'))::text AS last_date,
         COUNT(DISTINCT es.id) AS appearances
       FROM exercise_sessions es
       JOIN exercise_log_entries ele ON ele.session_id = es.id
       JOIN exercise_library el ON el.id = ele.exercise_id,
       unnest(el.primary_muscles) AS m(muscle)
       WHERE es.user_id = $1
         AND es.started_at >= NOW() - INTERVAL '60 days'
       GROUP BY m.muscle`,
      [userId]
    );

    if (rows.length === 0) return null;

    const today = new Date();
    const candidates = rows
      .filter((r) => parseInt(r.appearances) >= 2)
      .map((r) => {
        const last = new Date(r.last_date);
        const daysSince = Math.round((today.getTime() - last.getTime()) / 86400000);
        return { muscle: r.muscle, daysSince, last_date: r.last_date };
      })
      .filter((r) => r.daysSince >= 10)
      .sort((a, b) => b.daysSince - a.daysSince);

    if (candidates.length === 0) return null;

    const top = candidates[0];
    const muscle = top.muscle.replace(/_/g, " ");

    return {
      title: `${muscle.charAt(0).toUpperCase() + muscle.slice(1)} hasn't been trained in ${top.daysSince} days`,
      description: `You haven't trained ${muscle} in ${top.daysSince} days — your most recent session was ${top.last_date}. Consider adding it back to your rotation.`,
      confidence: "moderate",
      confidenceScore: 50,
      timesObserved: 1,
      supportingData: {
        muscle_group: top.muscle,
        days_since_last: top.daysSince,
        last_trained: top.last_date,
      },
    };
  },
};
