import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { parse as csvParseSync } from "csv-parse/sync";
import * as XLSX from "xlsx";

const DEFAULT_COLOR_CATEGORIES = [
  { label: "Diabetes",                  color_hex: "#3B82F6" },
  { label: "Vitamins / Supplements",    color_hex: "#22C55E" },
  { label: "Mental health",             color_hex: "#A855F7" },
  { label: "Blood pressure / Heart",    color_hex: "#EF4444" },
  { label: "Pain",                      color_hex: "#F97316" },
  { label: "Other",                     color_hex: "#EAB308" },
];

const rxCache = new Map<string, { results: string[]; expiresAt: number }>();

// ── Import helpers ─────────────────────────────────────────────────────────────

const FIELD_SYNONYMS: Record<string, string[]> = {
  name:         ["medication", "medication name", "drug", "drug name", "name", "med name", "medicine"],
  dosage:       ["dose", "dosage", "strength", "dose strength"],
  schedule:     ["frequency", "schedule", "times", "time of day", "time_of_day", "timing"],
  prescriber:   ["doctor", "prescriber", "physician", "provider", "doctor name"],
  pharmacy:     ["pharmacy", "pharmacist", "pharmacy name"],
  notes:        ["notes", "comments", "comment", "additional notes"],
  brand_name:   ["brand name", "brand"],
  generic_name: ["generic name", "generic"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, "");
}

function autoDetectMapping(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
    const match = headers.find((h) => synonyms.includes(normalizeHeader(h)));
    mapping[field] = match ?? null;
  }
  return mapping;
}

function parseFileBuffer(fileBuffer: Buffer, filename: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "csv") {
    const records = csvParseSync(fileBuffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
    return { headers: Object.keys(records[0] ?? {}), rows: records };
  }

  if (ext === "xlsx" || ext === "xls") {
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
    return { headers: Object.keys(rows[0] ?? {}), rows };
  }

  throw new Error(`Unsupported file type: .${ext}`);
}

function normalizeSchedule(scheduleStr: string): Array<{ time_of_day: string; specific_time: string | null }> {
  const s = scheduleStr.toLowerCase().trim();
  if (!s) return [];
  const morning = { time_of_day: "morning", specific_time: null };
  const midday  = { time_of_day: "midday",  specific_time: null };
  const evening = { time_of_day: "evening", specific_time: null };

  if ((s.includes("morning") && (s.includes("night") || s.includes("evening"))) ||
      s === "bid" || s === "twice daily" || s === "twice a day" || s === "2x daily") {
    return [morning, evening];
  }
  if (s.includes("morning") && s.includes("midday") && (s.includes("evening") || s.includes("night")) ||
      s === "tid" || s === "three times daily" || s === "3x daily") {
    return [morning, midday, evening];
  }
  if (s.includes("morning")) return [morning];
  if (s.includes("evening") || s.includes("night")) return [evening];
  if (s.includes("midday") || s.includes("noon") || s.includes("afternoon")) return [midday];
  if (s === "qd" || s === "once daily" || s === "daily") return [morning];
  // Custom
  return [{ time_of_day: "custom", specific_time: scheduleStr.trim() }];
}

// ── Shared query helpers ───────────────────────────────────────────────────────

const MED_SELECT = `
  SELECT m.id, m.name, m.dosage, m.active, m.notes, m.purpose, m.refill_date, m.created_at,
    m.generic_name, m.brand_name, m.drug_class, m.rxcui, m.alternative_brand_names,
    p.id AS prescriber_id, p.name AS prescriber_name,
    c.id AS cat_id, c.label AS cat_label, c.color_hex AS cat_color,
    COALESCE(json_agg(
      json_build_object(
        'id', s.id, 'time_of_day', s.time_of_day,
        'specific_time', s.specific_time::text, 'sort_order', s.sort_order,
        'dose_log', (SELECT row_to_json(dl) FROM (
          SELECT id, status, taken_at FROM medication_dose_logs
          WHERE medication_id = m.id AND slot_id = s.id AND user_id = m.user_id AND log_date = CURRENT_DATE
          LIMIT 1
        ) dl)
      ) ORDER BY s.sort_order
    ) FILTER (WHERE s.id IS NOT NULL), '[]') AS slots
  FROM medications m
  LEFT JOIN medication_prescribers p ON p.id = m.prescriber_id
  LEFT JOIN medication_color_categories c ON c.id = m.color_category_id
  LEFT JOIN medication_schedule_slots s ON s.medication_id = m.id
`;

function shapeMed(r: any) {
  return {
    id: r.id, name: r.name, dosage: r.dosage, active: r.active,
    notes: r.notes, purpose: r.purpose, refill_date: r.refill_date, created_at: r.created_at,
    generic_name: r.generic_name ?? null,
    brand_name: r.brand_name ?? null,
    drug_class: r.drug_class ?? null,
    rxcui: r.rxcui ?? null,
    alternative_brand_names: r.alternative_brand_names ?? null,
    prescriber: r.prescriber_id ? { id: r.prescriber_id, name: r.prescriber_name } : null,
    color_category: r.cat_id ? { id: r.cat_id, label: r.cat_label, color_hex: r.cat_color } : null,
    slots: r.slots,
  };
}

async function ensureDefaultCategories(user_id: string) {
  const existing = await query<any>(
    `SELECT id FROM medication_color_categories WHERE user_id = $1 LIMIT 1`,
    [user_id]
  );
  if (existing.length > 0) return;
  for (let i = 0; i < DEFAULT_COLOR_CATEGORIES.length; i++) {
    const cat = DEFAULT_COLOR_CATEGORIES[i];
    await query(
      `INSERT INTO medication_color_categories (user_id, label, color_hex, is_default, sort_order)
       VALUES ($1, $2, $3, true, $4) ON CONFLICT (user_id, label) DO NOTHING`,
      [user_id, cat.label, cat.color_hex, i]
    );
  }
}

export default async function medicationsRoutes(app: FastifyInstance) {

  // ── List medications ─────────────────────────────────────────────────────────
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>(
      `${MED_SELECT}
       WHERE m.user_id = $1 AND m.active = true
       GROUP BY m.id, p.id, c.id
       ORDER BY MIN(CASE s.time_of_day WHEN 'morning' THEN 1 WHEN 'midday' THEN 2 WHEN 'evening' THEN 3 ELSE 4 END), m.name`,
      [user_id]
    );
    return rows.map(shapeMed);
  });

  // ── Add medication ───────────────────────────────────────────────────────────
  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { name, dosage, notes, purpose, refill_date, slots, color_category_id, prescriber_id } = req.body as any;

    await ensureDefaultCategories(user_id);

    const [med] = await query<any>(
      `INSERT INTO medications (user_id, name, dosage, notes, purpose, refill_date, color_category_id, prescriber_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [user_id, name, dosage ?? null, notes ?? null, purpose ?? null,
       refill_date ?? null, color_category_id ?? null, prescriber_id ?? null]
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

    await query(
      `INSERT INTO medication_history (medication_id, change_type, new_value)
       VALUES ($1, 'added', $2)`,
      [med.id, name]
    );

    const [result] = await query<any>(
      `${MED_SELECT} WHERE m.id = $1 GROUP BY m.id, p.id, c.id`,
      [med.id]
    );
    return shapeMed(result);
  });

  // ── Update medication ────────────────────────────────────────────────────────
  app.patch("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const { name, dosage, notes, purpose, refill_date, active, slots,
            color_category_id, prescriber_id, reason, changed_by,
            generic_name, brand_name, drug_class, rxcui, alternative_brand_names } = req.body as any;

    // Fetch current state for history diff
    const [current] = await query<any>(
      `SELECT m.*, p.name AS prescriber_name,
              ARRAY_AGG(s.time_of_day ORDER BY s.sort_order) FILTER (WHERE s.id IS NOT NULL) AS slot_times
       FROM medications m
       LEFT JOIN medication_prescribers p ON p.id = m.prescriber_id
       LEFT JOIN medication_schedule_slots s ON s.medication_id = m.id
       WHERE m.id = $1 AND m.user_id = $2 GROUP BY m.id, p.name`,
      [id, user_id]
    );
    if (!current) throw { statusCode: 404, message: "Not found" };

    await query(
      `UPDATE medications
       SET name = COALESCE($1, name), dosage = COALESCE($2, dosage),
           notes = COALESCE($3, notes), purpose = COALESCE($4, purpose),
           refill_date = COALESCE($5, refill_date), active = COALESCE($6, active),
           color_category_id = COALESCE($7, color_category_id),
           prescriber_id = COALESCE($8, prescriber_id),
           generic_name = COALESCE($11, generic_name),
           brand_name = COALESCE($12, brand_name),
           drug_class = COALESCE($13, drug_class),
           rxcui = COALESCE($14, rxcui),
           alternative_brand_names = COALESCE($15, alternative_brand_names)
       WHERE id = $9 AND user_id = $10`,
      [name ?? null, dosage ?? null, notes ?? null, purpose ?? null, refill_date ?? null,
       active ?? null, color_category_id ?? null, prescriber_id ?? null, id, user_id,
       generic_name ?? null, brand_name ?? null, drug_class ?? null, rxcui ?? null,
       alternative_brand_names ?? null]
    );

    // Write history entries for changed fields
    const histEntries: Array<[string, string | null, string | null]> = [];
    if (dosage !== undefined && dosage !== null && dosage !== current.dosage) {
      histEntries.push(["dose_changed", current.dosage, dosage]);
    }
    if (prescriber_id !== undefined && prescriber_id !== current.prescriber_id) {
      const [newP] = prescriber_id
        ? await query<any>(`SELECT name FROM medication_prescribers WHERE id = $1`, [prescriber_id])
        : [{ name: null }];
      histEntries.push(["prescriber_changed", current.prescriber_name ?? null, newP?.name ?? null]);
    }

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
      const newTimes = slots.map((s: any) => s.time_of_day).sort().join(", ");
      const oldTimes = (current.slot_times ?? []).sort().join(", ");
      if (newTimes !== oldTimes) {
        histEntries.push(["frequency_changed", oldTimes || null, newTimes || null]);
      }
    }

    for (const [change_type, old_value, new_value] of histEntries) {
      await query(
        `INSERT INTO medication_history (medication_id, change_type, old_value, new_value, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, change_type, old_value, new_value, reason ?? null, changed_by ?? null]
      );
    }

    const [result] = await query<any>(
      `${MED_SELECT} WHERE m.id = $1 GROUP BY m.id, p.id, c.id`,
      [id]
    );
    return shapeMed(result);
  });

  // ── Stop (soft-delete) medication ────────────────────────────────────────────
  app.delete("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const [med] = await query<any>(
      `UPDATE medications SET active = false WHERE id = $1 AND user_id = $2 RETURNING name`,
      [id, user_id]
    );
    if (med) {
      await query(
        `INSERT INTO medication_history (medication_id, change_type, old_value)
         VALUES ($1, 'stopped', $2)`,
        [id, med.name]
      );
    }
    return { ok: true };
  });

  // ── RxNorm lookup by name (for add-medication pre-fill) ──────────────────────
  app.get("/rxnorm-by-name", async (req) => {
    const { name } = req.query as any;
    if (!name) return { rxcui: null, brand_name: null, generic_name: null, drug_class: null };
    try {
      const r1 = await fetch(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}`);
      const d1: any = await r1.json();
      const rxcui: string | null = d1?.idGroup?.rxnormId?.[0] ?? null;
      if (!rxcui) return { rxcui: null, brand_name: null, generic_name: null, drug_class: null };
      const [rBN, rIN] = await Promise.all([
        fetch(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=BN`),
        fetch(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=IN`),
      ]);
      const [dBN, dIN]: [any, any] = await Promise.all([rBN.json(), rIN.json()]);
      const brandNames: string[] = (dBN?.relatedGroup?.conceptGroup ?? [])
        .flatMap((g: any) => g.conceptProperties ?? []).map((p: any) => p.name).filter(Boolean);
      const genericNames: string[] = (dIN?.relatedGroup?.conceptGroup ?? [])
        .flatMap((g: any) => g.conceptProperties ?? []).map((p: any) => p.name).filter(Boolean);
      return {
        rxcui,
        brand_name: brandNames[0] ?? null,
        generic_name: genericNames[0] ?? null,
        drug_class: null,
      };
    } catch {
      return { rxcui: null, brand_name: null, generic_name: null, drug_class: null };
    }
  });

  // ── RxTerms search ───────────────────────────────────────────────────────────
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
      const results = displayStrings.map((row) => row[0]).slice(0, 20);
      rxCache.set(cacheKey, { results, expiresAt: Date.now() + 3600000 });
      return results;
    } catch {
      return [];
    }
  });

  // ── RxNorm brand/generic lookup ──────────────────────────────────────────────
  app.post("/:id/rxnorm", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const [med] = await query<any>(
      `SELECT id, name, rxcui FROM medications WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!med) throw { statusCode: 404, message: "Not found" };

    // If rxcui already cached, skip the name lookup step
    let rxcui: string | null = med.rxcui ?? null;
    if (!rxcui) {
      try {
        const r1 = await fetch(`https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(med.name)}`);
        const d1: any = await r1.json();
        rxcui = d1?.idGroup?.rxnormId?.[0] ?? null;
      } catch { /* network error — return null */ }
    }

    if (!rxcui) return { rxcui: null, brand_name: null, generic_name: null };

    let brandNames: string[] = [];
    let genericNames: string[] = [];
    try {
      const [rBN, rIN] = await Promise.all([
        fetch(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=BN`),
        fetch(`https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/related.json?tty=IN`),
      ]);
      const [dBN, dIN]: [any, any] = await Promise.all([rBN.json(), rIN.json()]);
      brandNames = dBN?.relatedGroup?.conceptGroup
        ?.find((g: any) => g.tty === "BN")?.conceptProperties
        ?.map((p: any) => p.name as string) ?? [];
      genericNames = dIN?.relatedGroup?.conceptGroup
        ?.find((g: any) => g.tty === "IN")?.conceptProperties
        ?.map((p: any) => p.name as string) ?? [];
    } catch { /* network error — continue with what we have */ }

    const brand_name = brandNames[0] ?? null;
    const generic_name = genericNames[0] ?? null;
    const alternative_brand_names = brandNames.length > 1 ? brandNames.slice(1) : null;

    await query(
      `UPDATE medications SET rxcui = $1, brand_name = $2, generic_name = $3, alternative_brand_names = $4
       WHERE id = $5 AND user_id = $6`,
      [rxcui, brand_name, generic_name, alternative_brand_names, id, user_id]
    );

    const [result] = await query<any>(`${MED_SELECT} WHERE m.id = $1 GROUP BY m.id, p.id, c.id`, [id]);
    return shapeMed(result);
  });

  // ── openFDA drug label ───────────────────────────────────────────────────────
  app.get("/:id/label", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const [med] = await query<any>(
      `SELECT id, name, rxcui, generic_name FROM medications WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!med) throw { statusCode: 404, message: "Not found" };

    const rxcui: string | null = med.rxcui ?? null;
    if (!rxcui) return { found: false };

    // Check cache (30-day TTL)
    const [cached] = await query<any>(
      `SELECT label_json FROM drug_label_cache WHERE rxcui = $1 AND fetched_at > NOW() - INTERVAL '30 days'`,
      [rxcui]
    );
    if (cached) return { found: true, label: cached.label_json };

    // Fetch from openFDA
    const DISCLAIMER = "Per the FDA-approved drug label. Talk to your prescriber about any questions.";
    try {
      let url = `https://api.fda.gov/drug/label.json?search=openfda.rxcui:%22${encodeURIComponent(rxcui)}%22&limit=1`;
      let res = await fetch(url);
      if (res.status === 404 && med.generic_name) {
        url = `https://api.fda.gov/drug/label.json?search=openfda.generic_name:%22${encodeURIComponent(med.generic_name)}%22&limit=1`;
        res = await fetch(url);
      }
      if (!res.ok) return { found: false };

      const data: any = await res.json();
      const r = data?.results?.[0];
      if (!r) return { found: false };

      const label = {
        indications: r.indications_and_usage?.[0] ?? null,
        dosage: r.dosage_and_administration?.[0] ?? null,
        warnings: r.warnings?.[0] ?? null,
        adverse_reactions: r.adverse_reactions?.[0] ?? null,
        disclaimer: DISCLAIMER,
      };

      await query(
        `INSERT INTO drug_label_cache (rxcui, label_json) VALUES ($1, $2)
         ON CONFLICT (rxcui) DO UPDATE SET label_json = $2, fetched_at = NOW()`,
        [rxcui, JSON.stringify(label)]
      );

      return { found: true, label };
    } catch {
      return { found: false };
    }
  });

  // ── Change history ───────────────────────────────────────────────────────────
  app.get("/:id/history", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const [med] = await query<any>(
      `SELECT id FROM medications WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!med) throw { statusCode: 404, message: "Not found" };
    return query<any>(
      `SELECT id, change_type, old_value, new_value, reason, changed_by, changed_at
       FROM medication_history WHERE medication_id = $1
       ORDER BY changed_at DESC`,
      [id]
    );
  });

  // ── Import: preview (multi-format) ──────────────────────────────────────────
  app.post("/import/preview", async (req) => {
    const { fileBase64, filename } = req.body as any;
    if (!fileBase64 || !filename) throw { statusCode: 400, message: "fileBase64 and filename required" };

    const fileBuffer = Buffer.from(fileBase64, "base64");
    const { headers, rows } = parseFileBuffer(fileBuffer, filename);
    if (rows.length === 0) return { headers: [], rows: [], suggestedMapping: {} };

    const suggestedMapping = autoDetectMapping(headers);
    return { headers, rows: rows.slice(0, 50), suggestedMapping };
  });

  // ── Import: commit (with column mapping) ────────────────────────────────────
  app.post("/import/commit", async (req) => {
    const user_id = req.user_id;
    const { rows, mapping } = req.body as any;
    if (!Array.isArray(rows) || !mapping) return { imported: 0 };

    await ensureDefaultCategories(user_id);

    let imported = 0;
    for (const row of rows as Record<string, string>[]) {
      const name = (row[mapping.name ?? ""] ?? "").trim();
      if (!name) continue;

      const dosage     = (row[mapping.dosage     ?? ""] ?? "").trim() || null;
      const schedStr   = (row[mapping.schedule   ?? ""] ?? "").trim();
      const prescrName = (row[mapping.prescriber ?? ""] ?? "").trim();
      const notes      = (row[mapping.notes      ?? ""] ?? "").trim() || null;

      // Resolve or create prescriber
      let prescriber_id: string | null = null;
      if (prescrName) {
        const existing = await query<any>(
          `SELECT id FROM medication_prescribers WHERE user_id = $1 AND lower(name) = lower($2) LIMIT 1`,
          [user_id, prescrName]
        );
        if (existing[0]) {
          prescriber_id = existing[0].id;
        } else {
          const [p] = await query<any>(
            `INSERT INTO medication_prescribers (user_id, name) VALUES ($1, $2) RETURNING id`,
            [user_id, prescrName]
          );
          prescriber_id = p.id;
        }
      }

      const [med] = await query<any>(
        `INSERT INTO medications (user_id, name, dosage, notes, prescriber_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [user_id, name, dosage, notes, prescriber_id]
      );

      const slots = normalizeSchedule(schedStr);
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        await query(
          `INSERT INTO medication_schedule_slots (medication_id, time_of_day, specific_time, sort_order)
           VALUES ($1, $2, $3, $4)`,
          [med.id, s.time_of_day, s.specific_time, i]
        );
      }

      await query(
        `INSERT INTO medication_history (medication_id, change_type, new_value)
         VALUES ($1, 'added', $2)`,
        [med.id, name]
      );

      imported++;
    }
    return { imported };
  });
}
