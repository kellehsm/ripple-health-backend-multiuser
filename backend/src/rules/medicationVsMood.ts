import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const MedicationVsMoodRule: InsightRule = {
  id: "medication_vs_mood",
  type: "combined",
  minDays: 14,

  async run(userId: string): Promise<InsightResult | null> {
    // Return null if user has no scheduled slots
    const [slotRow] = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM medication_schedule_slots mss
       JOIN medications m ON m.id = mss.medication_id
       WHERE m.user_id = $1 AND m.active = true`,
      [userId]
    );
    if (parseInt(slotRow?.cnt ?? "0") === 0) return null;

    // Get all days in last 60 days, with mood from daily_summaries
    // and whether a dose was taken that day
    const rows = await query<{ day: string; avg_mood: number; taken_count: string }>(
      `SELECT
         ds.date::text AS day,
         (ds.summary_data->'mood'->>'averageScore')::numeric AS avg_mood,
         COUNT(mdl.id) AS taken_count
       FROM daily_summaries ds
       LEFT JOIN medication_dose_logs mdl
         ON mdl.user_id = $1
         AND mdl.log_date = ds.date
         AND mdl.status = 'taken'
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 60
         AND ds.summary_data->'mood'->>'averageScore' IS NOT NULL
       GROUP BY ds.date, ds.summary_data
       ORDER BY ds.date DESC`,
      [userId]
    );

    if (rows.length < 8) return null;

    const adherentDays    = rows.filter(r => parseInt(r.taken_count) > 0);
    const nonAdherentDays = rows.filter(r => parseInt(r.taken_count) === 0);

    if (adherentDays.length < 4 || nonAdherentDays.length < 4) return null;

    const avgMoodAdherent    = adherentDays.reduce((s, r) => s + Number(r.avg_mood), 0) / adherentDays.length;
    const avgMoodNonAdherent = nonAdherentDays.reduce((s, r) => s + Number(r.avg_mood), 0) / nonAdherentDays.length;

    const diff = avgMoodAdherent - avgMoodNonAdherent;
    if (Math.abs(diff) < 0.2) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(
      Math.min(adherentDays.length, nonAdherentDays.length),
      effectRatio
    );

    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Mood tends to be ${direction} on days you take your medications`,
      description: `Over the last 60 days, your average mood was ${avgMoodAdherent.toFixed(1)}/5 on days you took your medications and ${avgMoodNonAdherent.toFixed(1)}/5 on days without a logged dose.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        days_analyzed: rows.length,
        adherent_days: adherentDays.length,
        non_adherent_days: nonAdherentDays.length,
        avg_mood_adherent: avgMoodAdherent.toFixed(2),
        avg_mood_non_adherent: avgMoodNonAdherent.toFixed(2),
        difference: diff.toFixed(2),
        direction,
      },
    };
  },
};
