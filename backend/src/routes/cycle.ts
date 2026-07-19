import { FastifyInstance } from "fastify";
import { query } from "../db.js";

const DEFAULT_SYMPTOMS = ["cramps", "headache", "fatigue", "bloating", "mood_change"];

function detectPeriods(flowDays: string[]): Array<{ start: string; end: string }> {
  if (flowDays.length === 0) return [];
  const sorted = [...flowDays].sort();
  const periods: Array<{ start: string; end: string }> = [];
  let groupStart = sorted[0];
  let groupEnd = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(groupEnd).getTime();
    const curr = new Date(sorted[i]).getTime();
    const diffDays = (curr - prev) / 86400000;
    if (diffDays <= 2) {
      groupEnd = sorted[i];
    } else {
      periods.push({ start: groupStart, end: groupEnd });
      groupStart = sorted[i];
      groupEnd = sorted[i];
    }
  }
  periods.push({ start: groupStart, end: groupEnd });
  return periods;
}

export default async function cycleRoutes(app: FastifyInstance) {
  app.post("/logs", async (req) => {
    const user_id = req.user_id;
    const { log_date, flow_intensity, symptoms, mood_label, notes, energy_level } = req.body as any;
    const [row] = await query<any>(
      `INSERT INTO cycle_day_logs (user_id, log_date, flow_intensity, symptoms, mood_label, notes, energy_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, log_date) DO UPDATE SET
         flow_intensity = EXCLUDED.flow_intensity,
         symptoms = EXCLUDED.symptoms,
         mood_label = EXCLUDED.mood_label,
         notes = EXCLUDED.notes,
         energy_level = EXCLUDED.energy_level,
         updated_at = now()
       RETURNING *`,
      [user_id, log_date, flow_intensity ?? null, symptoms ?? null, mood_label ?? null, notes ?? null, energy_level ?? null]
    );
    if (mood_label) {
      await query(
        `INSERT INTO emotion_vocabulary (user_id, label, source) VALUES ($1, $2, 'cycle_tab')
         ON CONFLICT (user_id, label) DO NOTHING`,
        [user_id, mood_label]
      );
    }
    return row;
  });

  app.get("/logs", async (req) => {
    const user_id = req.user_id;
    const { from, to } = req.query as any;
    const rows = await query<any>(
      `SELECT * FROM cycle_day_logs
       WHERE user_id = $1 AND log_date >= $2 AND log_date <= $3
       ORDER BY log_date ASC`,
      [user_id, from, to]
    );
    return rows;
  });

  app.get("/logs/:date", async (req) => {
    const user_id = req.user_id;
    const { date } = req.params as any;
    const rows = await query<any>(
      `SELECT * FROM cycle_day_logs WHERE user_id = $1 AND log_date = $2`,
      [user_id, date]
    );
    return rows[0] ?? null;
  });

  app.delete("/logs/:date", async (req) => {
    const user_id = req.user_id;
    const { date } = req.params as any;
    await query(
      `DELETE FROM cycle_day_logs WHERE user_id = $1 AND log_date = $2`,
      [user_id, date]
    );
    return { ok: true };
  });

  app.get("/symptoms/ranked", async (req) => {
    const user_id = req.user_id;
    const usageRows = await query<any>(
      `SELECT symptom, COUNT(*) as uses
       FROM cycle_day_logs, unnest(symptoms) AS symptom
       WHERE user_id = $1
       GROUP BY symptom ORDER BY uses DESC`,
      [user_id]
    );
    const customRows = await query<any>(
      `SELECT label FROM cycle_custom_symptoms WHERE user_id = $1`,
      [user_id]
    );
    const customSet = new Set(customRows.map((r: any) => r.label));
    const usageSet = new Set(usageRows.map((r: any) => r.symptom));

    const allSymptoms: string[] = [];
    const seen = new Set<string>();

    for (const r of usageRows) {
      if (!seen.has(r.symptom)) {
        allSymptoms.push(r.symptom);
        seen.add(r.symptom);
      }
    }
    for (const s of DEFAULT_SYMPTOMS) {
      if (!seen.has(s)) {
        allSymptoms.push(s);
        seen.add(s);
      }
    }
    for (const label of customSet) {
      if (!seen.has(label)) {
        allSymptoms.push(label);
        seen.add(label);
      }
    }

    return {
      common: allSymptoms.slice(0, 5),
      more: allSymptoms.slice(5),
    };
  });

  app.post("/symptoms/custom", async (req) => {
    const user_id = req.user_id;
    const { label } = req.body as any;
    const [row] = await query<any>(
      `INSERT INTO cycle_custom_symptoms (user_id, label) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`,
      [user_id, label]
    );
    return row ?? { user_id, label };
  });

  app.get("/moods/ranked", async (req) => {
    const user_id = req.user_id;
    const { q } = req.query as any;
    const search = q ?? "";
    const rows = await query<any>(
      `SELECT ev.label, COUNT(cdl.id) + COUNT(je.id) AS uses
       FROM emotion_vocabulary ev
       LEFT JOIN cycle_day_logs cdl ON cdl.mood_label = ev.label AND cdl.user_id = $1
       LEFT JOIN journal_entries je ON je.mood_label = ev.label AND je.user_id = $1
       WHERE (ev.user_id IS NULL OR ev.user_id = $1)
         AND ($2 = '' OR ev.label ILIKE '%' || $2 || '%')
       GROUP BY ev.label
       ORDER BY uses DESC, ev.label
       LIMIT 20`,
      [user_id, search]
    );
    return rows;
  });

  app.get("/prediction", async (req) => {
    const user_id = req.user_id;
    const flowRows = await query<any>(
      `SELECT log_date::text FROM cycle_day_logs
       WHERE user_id = $1 AND flow_intensity != 'none' AND flow_intensity IS NOT NULL
       ORDER BY log_date ASC`,
      [user_id]
    );

    const flowDays = flowRows.map((r: any) => r.log_date);
    const periods = detectPeriods(flowDays);

    if (periods.length < 3) {
      return { predictedNextStart: null, avgCycleLength: null, cycleLengthsUsed: 0, confidence: "none" };
    }

    const starts = periods.map((p) => p.start);
    const cycleLengths: number[] = [];
    for (let i = 1; i < starts.length; i++) {
      const prev = new Date(starts[i - 1]).getTime();
      const curr = new Date(starts[i]).getTime();
      cycleLengths.push(Math.round((curr - prev) / 86400000));
    }

    const recent = cycleLengths.slice(-6);
    const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
    const lastPeriodStart = starts[starts.length - 1];
    const lastDate = new Date(lastPeriodStart);
    lastDate.setDate(lastDate.getDate() + avg);
    const predictedNextStart = lastDate.toISOString().slice(0, 10);
    const today = new Date();
    const lastPeriodDate = new Date(lastPeriodStart);
    const currentCycleDay = Math.round((today.getTime() - lastPeriodDate.getTime()) / 86400000) + 1;
    const confidence = recent.length >= 5 ? "moderate" : "low";

    // Average period length: mean days with flow per detected period (end - start + 1)
    const periodLengths = periods.map((p) => {
      const s = new Date(p.start).getTime();
      const e = new Date(p.end).getTime();
      return Math.round((e - s) / 86400000) + 1;
    });
    const avgPeriodLength = Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length);

    return {
      predictedNextStart,
      avgCycleLength: avg,
      avgPeriodLength,
      cycleLengthsUsed: recent.length,
      confidence,
      lastPeriodStart,
      currentCycleDay,
    };
  });

  app.get("/instruction-card", async (req) => {
    const user_id = req.user_id;
    const [row] = await query<any>(
      `SELECT cycle_instruction_card_dismissed FROM users WHERE id = $1`,
      [user_id]
    );
    return { dismissed: row?.cycle_instruction_card_dismissed ?? false };
  });

  app.post("/instruction-card/dismiss", async (req) => {
    const user_id = req.user_id;
    await query(
      `UPDATE users SET cycle_instruction_card_dismissed = true WHERE id = $1`,
      [user_id]
    );
    return { ok: true };
  });

  app.get("/history", async (req) => {
    const user_id = req.user_id;
    const flowRows = await query<any>(
      `SELECT log_date::text FROM cycle_day_logs
       WHERE user_id = $1 AND flow_intensity != 'none' AND flow_intensity IS NOT NULL
       ORDER BY log_date ASC`,
      [user_id]
    );

    const flowDays = flowRows.map((r: any) => r.log_date);
    const periods = detectPeriods(flowDays);

    return periods.slice(-12).map((p) => {
      const start = new Date(p.start).getTime();
      const end = new Date(p.end).getTime();
      const length_days = Math.round((end - start) / 86400000) + 1;
      return { start: p.start, end: p.end, length_days };
    });
  });

  // §8 – Overview insight engine
  // Returns the single highest-priority insight that qualifies, or null if none do.
  // Priority: D (cycle-phase symptom, 4) > C (period approaching, 3) > B (missed slot, 2) > A (adherence %, 1)
  app.get("/overview-insight", async (req) => {
    const user_id = req.user_id;

    // Shared: compute periods + prediction for C and D
    const flowRows = await query<any>(
      `SELECT log_date::text FROM cycle_day_logs
       WHERE user_id = $1 AND flow_intensity != 'none' AND flow_intensity IS NOT NULL
       ORDER BY log_date ASC`,
      [user_id]
    );
    const flowDays = flowRows.map((r: any) => r.log_date);
    const periods = detectPeriods(flowDays);

    let predNextStart: string | null = null;
    let predConfidence = "none";
    let currentCycleDay: number | null = null;

    if (periods.length >= 3) {
      const starts = periods.map((p) => p.start);
      const lens: number[] = [];
      for (let i = 1; i < starts.length; i++) {
        lens.push(Math.round((new Date(starts[i]).getTime() - new Date(starts[i - 1]).getTime()) / 86400000));
      }
      const recent = lens.slice(-6);
      const avg = Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
      const pred = new Date(starts[starts.length - 1]);
      pred.setDate(pred.getDate() + avg);
      predNextStart = pred.toISOString().slice(0, 10);
      predConfidence = recent.length >= 5 ? "moderate" : "low";
      currentCycleDay = Math.round((Date.now() - new Date(starts[starts.length - 1]).getTime()) / 86400000) + 1;

      // D: cycle-phase symptom correlation across past cycles
      const phaseStart = currentCycleDay <= 5 ? 1 : currentCycleDay <= 13 ? 6 : 14;
      const phaseEnd   = currentCycleDay <= 5 ? 5 : currentCycleDay <= 13 ? 13 : 999;
      const cycleSymSets: Set<string>[] = [];

      for (let i = 0; i < starts.length - 1; i++) {
        const cycleMs = new Date(starts[i]).getTime();
        const phaseFrom = new Date(cycleMs + (phaseStart - 1) * 86400000).toISOString().slice(0, 10);
        const rawTo     = new Date(cycleMs + (phaseEnd   - 1) * 86400000).toISOString().slice(0, 10);
        const nextMinus1 = new Date(new Date(starts[i + 1]).getTime() - 86400000).toISOString().slice(0, 10);
        const actualTo = rawTo < nextMinus1 ? rawTo : nextMinus1;
        const symRows = await query<any>(
          `SELECT unnest(symptoms) AS symptom FROM cycle_day_logs
           WHERE user_id = $1 AND log_date >= $2 AND log_date <= $3`,
          [user_id, phaseFrom, actualTo]
        );
        cycleSymSets.push(new Set<string>(symRows.map((r: any) => r.symptom)));
      }

      if (cycleSymSets.length > 0) {
        const totalCycles = cycleSymSets.length;
        const counts = new Map<string, number>();
        for (const s of cycleSymSets) for (const sym of s) counts.set(sym, (counts.get(sym) ?? 0) + 1);

        const best = [...counts.entries()]
          .filter(([, c]) => c >= 3 && c / totalCycles >= 0.6)
          .sort((a, b) => b[1] - a[1])[0];

        if (best) {
          const [sym, count] = best;
          const label = sym.replace(/_/g, " ");
          return {
            id: "cycle_symptom_pattern",
            text: `${label.charAt(0).toUpperCase() + label.slice(1)} has shown up in ${count} of your last ${totalCycles} cycles around this phase.`,
            confidence: "pattern",
          };
        }
      }
    }

    // C: period approaching within 7 days
    if (predNextStart && predConfidence !== "none") {
      const daysUntil = Math.round((new Date(predNextStart).getTime() - Date.now()) / 86400000);
      if (daysUntil >= 0 && daysUntil <= 7) {
        return {
          id: "period_approaching",
          text: `Period expected in about ${daysUntil} day${daysUntil === 1 ? "" : "s"}.`,
          confidence: predConfidence === "moderate" ? "pattern" : "tentative",
        };
      }
    }

    // B: missed-slot pattern — which time-of-day had the most unlogged days in the last 7?
    const missRows = await query<any>(
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
      [user_id]
    );
    const topMiss = missRows[0];
    if (topMiss && parseInt(topMiss.missed_days) >= 1) {
      const count = parseInt(topMiss.missed_days);
      const slot = topMiss.tod as string;
      return {
        id: "missed_slot_pattern",
        text: count === 1
          ? `Your ${slot} dose wasn't logged today.`
          : `Your ${slot} dose has been missed ${count} of the last 7 days.`,
        confidence: "pattern",
      };
    }

    // A: weekly adherence %
    const [schedRow, takenRow] = await Promise.all([
      query<any>(
        `SELECT COUNT(*) AS cnt FROM medication_schedule_slots mss
         JOIN medications m ON m.id = mss.medication_id
         WHERE m.user_id = $1 AND m.active = true`,
        [user_id]
      ),
      query<any>(
        `SELECT COUNT(*) AS cnt FROM medication_dose_logs
         WHERE user_id = $1 AND status = 'taken'
           AND log_date >= CURRENT_DATE - 6 AND log_date <= CURRENT_DATE`,
        [user_id]
      ),
    ]);
    const slotsPerDay = parseInt(schedRow[0]?.cnt ?? "0");
    const scheduledWeek = slotsPerDay * 7;
    const takenWeek = parseInt(takenRow[0]?.cnt ?? "0");
    if (takenWeek > 0 && scheduledWeek > 0) {
      const pct = Math.round((takenWeek / scheduledWeek) * 100);
      return {
        id: "adherence_weekly",
        text: `You've taken ${pct}% of scheduled doses this week.`,
        confidence: "stat",
      };
    }

    return null;
  });
}
