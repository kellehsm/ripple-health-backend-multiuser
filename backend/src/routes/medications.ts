import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { parse as csvParseSync } from "csv-parse/sync";

interface ParsedMedRow {
  name: string;
  dosage: string;
  time_of_day: string;
  specific_time: string;
  notes: string;
  errors: string[];
}

const rxCache = new Map<string, { results: string[]; expiresAt: number }>();

function parseMedicationCsv(csv: string): ParsedMedRow[] {
  const records = csvParseSync(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return (records as Record<string, string>[]).map((row) => {
    const errors: string[] = [];
    const name = (row["name"] ?? "").trim();
    const dosage = (row["dosage"] ?? "").trim();
    const time_of_day = (row["time_of_day"] ?? "").trim().toLowerCase();
    const specific_time = (row["specific_time"] ?? "").trim();
    const notes = (row["notes"] ?? "").trim();

    if (!name) errors.push("name is required");
    if (time_of_day && !["morning", "midday", "evening", "custom"].includes(time_of_day)) {
      errors.push("time_of_day must be morning, midday, evening, or custom");
    }

    return { name, dosage, time_of_day, specific_time, notes, errors };
  });
}

export default async function medicationsRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const today = new Date().toISOString().slice(0, 10);
    const rows = await query<any>(
      `SELECT m.id, m.name, m.dosage, m.active, m.notes,
        COALESCE(json_agg(
          json_build_object(
            'id', s.id, 'time_of_day', s.time_of_day,
            'specific_time', s.specific_time::text, 'sort_order', s.sort_order,
            'dose_log', (SELECT row_to_json(dl) FROM (
              SELECT id, status, taken_at FROM medication_dose_logs
              WHERE medication_id = m.id AND slot_id = s.id
                AND user_id = $1 AND log_date = $2
              LIMIT 1
            ) dl)
          ) ORDER BY s.sort_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') AS slots
      FROM medications m
      LEFT JOIN medication_schedule_slots s ON s.medication_id = m.id
      WHERE m.user_id = $1 AND m.active = true
      GROUP BY m.id
      ORDER BY MIN(CASE s.time_of_day WHEN 'morning' THEN 1 WHEN 'midday' THEN 2 WHEN 'evening' THEN 3 ELSE 4 END), m.name`,
      [user_id, today]
    );
    return rows;
  });

  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { name, dosage, notes, slots } = req.body as any;
    const [med] = await query<any>(
      `INSERT INTO medications (user_id, name, dosage, notes) VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, name, dosage ?? null, notes ?? null]
    );
    if (Array.isArray(slots) && slots.length > 0) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        await query(
          `INSERT INTO medication_schedule_slots (medication_id, time_of_day, specific_time, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [med.id, s.time_of_day, s.specific_time ?? null, i]
        );
      }
    }
    const [result] = await query<any>(
      `SELECT m.id, m.name, m.dosage, m.active, m.notes,
        COALESCE(json_agg(
          json_build_object('id', s.id, 'time_of_day', s.time_of_day, 'specific_time', s.specific_time::text, 'sort_order', s.sort_order)
          ORDER BY s.sort_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') AS slots
       FROM medications m
       LEFT JOIN medication_schedule_slots s ON s.medication_id = m.id
       WHERE m.id = $1 GROUP BY m.id`,
      [med.id]
    );
    return result;
  });

  app.patch("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const { name, dosage, notes, active, slots } = req.body as any;
    await query(
      `UPDATE medications SET name = COALESCE($1, name), dosage = COALESCE($2, dosage),
       notes = COALESCE($3, notes), active = COALESCE($4, active)
       WHERE id = $5 AND user_id = $6`,
      [name ?? null, dosage ?? null, notes ?? null, active ?? null, id, user_id]
    );
    if (Array.isArray(slots)) {
      await query(`DELETE FROM medication_schedule_slots WHERE medication_id = $1`, [id]);
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        await query(
          `INSERT INTO medication_schedule_slots (medication_id, time_of_day, specific_time, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [id, s.time_of_day, s.specific_time ?? null, i]
        );
      }
    }
    const [result] = await query<any>(
      `SELECT m.id, m.name, m.dosage, m.active, m.notes,
        COALESCE(json_agg(
          json_build_object('id', s.id, 'time_of_day', s.time_of_day, 'specific_time', s.specific_time::text, 'sort_order', s.sort_order)
          ORDER BY s.sort_order
        ) FILTER (WHERE s.id IS NOT NULL), '[]') AS slots
       FROM medications m
       LEFT JOIN medication_schedule_slots s ON s.medication_id = m.id
       WHERE m.id = $1 GROUP BY m.id`,
      [id]
    );
    return result;
  });

  app.delete("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    await query(`UPDATE medications SET active = false WHERE id = $1 AND user_id = $2`, [id, user_id]);
    return { ok: true };
  });

  app.get("/search", async (req) => {
    const { q } = req.query as any;
    if (!q || q.length < 2) return [];
    const cacheKey = q.toLowerCase();
    const cached = rxCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.results;
    try {
      const url = `https://clinicaltables.nlm.nih.gov/api/rxterms/v3/search?terms=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      const data: any = await res.json();
      const displayStrings: string[][] = data[3] ?? [];
      const results = displayStrings.map((row: string[]) => row[0]).slice(0, 20);
      rxCache.set(cacheKey, { results, expiresAt: Date.now() + 3600000 });
      return results;
    } catch {
      return [];
    }
  });

  app.post("/import/preview", async (req) => {
    const { csv } = req.body as any;
    const rows = parseMedicationCsv(csv ?? "");
    return { rows };
  });

  app.post("/import/commit", async (req) => {
    const user_id = req.user_id;
    const { rows } = req.body as any;
    if (!Array.isArray(rows)) return { imported: 0 };
    let imported = 0;
    for (const row of rows as ParsedMedRow[]) {
      if (row.errors && row.errors.length > 0) continue;
      const [med] = await query<any>(
        `INSERT INTO medications (user_id, name, dosage, notes) VALUES ($1, $2, $3, $4) RETURNING *`,
        [user_id, row.name, row.dosage || null, row.notes || null]
      );
      if (row.time_of_day) {
        await query(
          `INSERT INTO medication_schedule_slots (medication_id, time_of_day, specific_time, sort_order)
           VALUES ($1, $2, $3, 0)`,
          [med.id, row.time_of_day, row.specific_time || null]
        );
      }
      imported++;
    }
    return { imported };
  });
}
