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
    const { log_date, flow_intensity, symptoms, mood_label, notes } = req.body as any;
    const [row] = await query<any>(
      `INSERT INTO cycle_day_logs (user_id, log_date, flow_intensity, symptoms, mood_label, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, log_date) DO UPDATE SET
         flow_intensity = EXCLUDED.flow_intensity,
         symptoms = EXCLUDED.symptoms,
         mood_label = EXCLUDED.mood_label,
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING *`,
      [user_id, log_date, flow_intensity ?? null, symptoms ?? null, mood_label ?? null, notes ?? null]
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

    return {
      predictedNextStart,
      avgCycleLength: avg,
      cycleLengthsUsed: recent.length,
      confidence,
      lastPeriodStart,
      currentCycleDay,
    };
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
}
