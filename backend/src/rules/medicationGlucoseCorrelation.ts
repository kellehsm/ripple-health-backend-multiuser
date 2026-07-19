import { query } from "../db.js";
import { InsightRule, InsightResult } from "./types.js";

export const MedicationGlucoseCorrelationRule: InsightRule = {
  id: "medication_glucose_correlation",
  type: "combined",
  minDays: 30,

  async run(userId: string): Promise<InsightResult | null> {
    // Only relevant if user has active medications and glucose readings
    const [medRow] = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM medications WHERE user_id = $1 AND active = true`,
      [userId]
    );
    if (parseInt(medRow?.cnt ?? "0") === 0) return null;

    // Get scheduled slots per day count
    const [slotRow] = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM medication_schedule_slots mss
       JOIN medications m ON m.id = mss.medication_id
       WHERE m.user_id = $1 AND m.active = true`,
      [userId]
    );
    const slotsPerDay = parseInt(slotRow?.cnt ?? "0");
    if (slotsPerDay === 0) return null;

    // Get days in last 60 days with average glucose, grouped by adherence
    // Adherent day: at least one dose taken; missed day: no doses taken
    const rows = await query<{ day: string; avg_glucose: string; taken_count: string }>(
      `SELECT
         g.day,
         AVG(g.mg_dl) AS avg_glucose,
         COUNT(mdl.id) AS taken_count
       FROM (
         SELECT
           DATE(recorded_at AT TIME ZONE 'America/New_York') AS day,
           AVG(mg_dl) AS mg_dl
         FROM glucose_readings
         WHERE user_id = $1
           AND recorded_at >= NOW() - INTERVAL '60 days'
         GROUP BY DATE(recorded_at AT TIME ZONE 'America/New_York')
       ) g
       LEFT JOIN medication_dose_logs mdl
         ON mdl.user_id = $1
         AND mdl.log_date = g.day
         AND mdl.status = 'taken'
       GROUP BY g.day, g.mg_dl`,
      [userId]
    );

    if (rows.length < 10) return null;

    const adherentDays = rows.filter((r) => parseInt(r.taken_count) > 0);
    const missedDays = rows.filter((r) => parseInt(r.taken_count) === 0);

    if (adherentDays.length < 5 || missedDays.length < 5) return null;

    const avgAdherent = adherentDays.reduce((s, r) => s + parseFloat(r.avg_glucose), 0) / adherentDays.length;
    const avgMissed = missedDays.reduce((s, r) => s + parseFloat(r.avg_glucose), 0) / missedDays.length;

    const diff = avgMissed - avgAdherent;
    if (Math.abs(diff) < 10) return null;

    const direction = diff > 0 ? "lower" : "higher";
    const absDiff = Math.round(Math.abs(diff));
    const totalDays = rows.length;

    return {
      title: `Glucose tends to be ${direction} on days medication is taken`,
      description: `Your glucose readings have averaged ${absDiff} mg/dL ${direction} on days your medication was taken on schedule, based on your last ${totalDays} days of paired data.`,
      confidence: "moderate",
      confidenceScore: 50,
      timesObserved: adherentDays.length,
      supportingData: {
        days_analyzed: totalDays,
        adherent_days: adherentDays.length,
        missed_days: missedDays.length,
        avg_glucose_adherent: Math.round(avgAdherent),
        avg_glucose_missed: Math.round(avgMissed),
        difference_mg_dl: Math.round(diff),
        direction,
        recommendation: "Discuss this pattern with your healthcare provider.",
      },
    };
  },
};
