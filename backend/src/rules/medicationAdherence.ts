import { query } from "../db.js";
import { InsightRule, InsightResult } from "./types.js";

export const MedicationAdherenceRule: InsightRule = {
  id: "medication_adherence_weekly",
  type: "medication",
  minDays: 7,

  async run(userId: string): Promise<InsightResult | null> {
    const [schedRow] = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt
       FROM medication_schedule_slots mss
       JOIN medications m ON m.id = mss.medication_id
       WHERE m.user_id = $1 AND m.active = true`,
      [userId]
    );
    const slotsPerDay = parseInt(schedRow?.cnt ?? "0");
    if (slotsPerDay === 0) return null;

    const scheduledWeek = slotsPerDay * 7;

    const [takenRow] = await query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM medication_dose_logs
       WHERE user_id = $1 AND status = 'taken'
         AND log_date >= CURRENT_DATE - 6 AND log_date <= CURRENT_DATE`,
      [userId]
    );
    const takenWeek = parseInt(takenRow?.cnt ?? "0");
    if (takenWeek === 0) return null;

    const pct = Math.round((takenWeek / scheduledWeek) * 100);
    const confidence = pct >= 90 ? "high" : pct >= 70 ? "moderate" : "low";

    return {
      title: `${pct}% medication adherence this week`,
      description: `You've taken ${takenWeek} of ${scheduledWeek} scheduled doses over the last 7 days.`,
      confidence,
      confidenceScore: confidence === "high" ? 80 : confidence === "moderate" ? 55 : 30,
      timesObserved: 7,
      supportingData: {
        taken: takenWeek,
        scheduled: scheduledWeek,
        adherence_pct: pct,
        slots_per_day: slotsPerDay,
      },
    };
  },
};
