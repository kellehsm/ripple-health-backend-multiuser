import { query } from "../db.js";
import { InsightRule, InsightResult } from "./types.js";

export const MissedSlotRule: InsightRule = {
  id: "missed_slot_pattern",
  type: "medication",
  minDays: 7,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ tod: string; missed_days: string }>(
      `SELECT s.tod,
              COUNT(*) FILTER (WHERE taken_on.log_date IS NULL) AS missed_days
       FROM (
         SELECT DISTINCT mss.time_of_day AS tod
         FROM medication_schedule_slots mss
         JOIN medications m ON m.id = mss.medication_id
         WHERE m.user_id = $1 AND m.active = true
       ) s
       CROSS JOIN generate_series(0, 6) AS g(n)
       LEFT JOIN (
         SELECT DISTINCT mss2.time_of_day AS tod, mdl.log_date
         FROM medication_dose_logs mdl
         JOIN medication_schedule_slots mss2 ON mss2.id = mdl.slot_id
         WHERE mdl.user_id = $1 AND mdl.status = 'taken'
           AND mdl.log_date >= CURRENT_DATE - 6
       ) taken_on ON taken_on.tod = s.tod AND taken_on.log_date = CURRENT_DATE - g.n
       GROUP BY s.tod
       ORDER BY missed_days DESC
       LIMIT 1`,
      [userId]
    );

    const top = rows[0];
    if (!top) return null;

    const count = parseInt(top.missed_days);
    if (count < 3) return null;

    const slot = top.tod;

    return {
      title: `${slot.charAt(0).toUpperCase() + slot.slice(1)} dose missed ${count} of the last 7 days`,
      description: `Your ${slot} dose has been missed ${count} of the last 7 days. Setting a reminder for that time may help.`,
      confidence: "moderate",
      confidenceScore: 50,
      timesObserved: count,
      supportingData: { slot, missed_days: count, window_days: 7 },
    };
  },
};
