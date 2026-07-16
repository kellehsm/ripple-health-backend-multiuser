import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const HobbyVsMoodRule: InsightRule = {
  id: "hobby_vs_mood",
  type: "hobbies",
  minDays: 15,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; hobby_sessions: number; avg_mood: number }>(
      `SELECT
         ds.date::text AS date,
         COALESCE((ds.summary_data->'productivity'->>'hobbySessions')::numeric, 0) AS hobby_sessions,
         (ds.summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries ds
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 90
         AND ds.summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY ds.date DESC`,
      [userId]
    );

    if (rows.length < 15) return null;

    const hobbyDays    = rows.filter(r => Number(r.hobby_sessions) > 0);
    const nonHobbyDays = rows.filter(r => Number(r.hobby_sessions) === 0);

    if (hobbyDays.length < 5 || nonHobbyDays.length < 5) return null;

    const avgMoodHobby    = hobbyDays.reduce((s, r) => s + Number(r.avg_mood), 0) / hobbyDays.length;
    const avgMoodNoHobby  = nonHobbyDays.reduce((s, r) => s + Number(r.avg_mood), 0) / nonHobbyDays.length;

    const diff = avgMoodHobby - avgMoodNoHobby;
    if (Math.abs(diff) < 0.2) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(Math.min(hobbyDays.length, nonHobbyDays.length), effectRatio);

    const direction = diff > 0 ? "higher" : "lower";

    // Find the most-logged hobby name
    const topHobby = await query<{ name: string; count: number }>(
      `SELECT h.name, COUNT(*) AS count
       FROM hobby_logs hl
       JOIN hobbies h ON h.id = hl.hobby_id
       WHERE h.user_id = $1 AND hl.logged_at >= CURRENT_DATE - 90
       GROUP BY h.name ORDER BY count DESC LIMIT 1`,
      [userId]
    );
    const hobbyName = topHobby[0]?.name ?? "your hobbies";

    return {
      title: `${hobbyName} days tend to have ${direction} mood`,
      description: `Over the last 90 days, on the ${hobbyDays.length} days you logged a hobby session your average mood was ${avgMoodHobby.toFixed(1)}/5, compared to ${avgMoodNoHobby.toFixed(1)}/5 on days without one.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: hobbyDays.length,
      supportingData: {
        days_analyzed: rows.length,
        hobby_days: hobbyDays.length,
        non_hobby_days: nonHobbyDays.length,
        avg_mood_hobby: avgMoodHobby.toFixed(2),
        avg_mood_no_hobby: avgMoodNoHobby.toFixed(2),
        mood_difference: diff.toFixed(2),
        top_hobby: hobbyName,
        direction,
      },
    };
  },
};
