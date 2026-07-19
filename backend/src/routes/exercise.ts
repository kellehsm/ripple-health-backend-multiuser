import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { computeSessionHRSummary } from "../lib/hrZones.js";

export default async function exerciseRoutes(app: FastifyInstance) {

  // ── Library search ────────────────────────────────────────────────────────────
  app.get("/library", async (req) => {
    const { search = "", muscle = "", equipment = "", limit = "20" } = req.query as any;
    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
    const params: any[] = [muscle || null, equipment || null, lim];

    if (search.trim()) {
      params.unshift(`%${search.trim()}%`);
      return query(
        `SELECT id, name, category, equipment, primary_muscles, secondary_muscles, images
         FROM exercise_library
         WHERE name ILIKE $1
           AND ($2::text IS NULL OR $2 = ANY(primary_muscles))
           AND ($3::text IS NULL OR equipment = $3)
         ORDER BY similarity(name, $4), name
         LIMIT $5`,
        [`%${search.trim()}%`, muscle || null, equipment || null, search.trim(), lim]
      );
    }

    return query(
      `SELECT id, name, category, equipment, primary_muscles, secondary_muscles, images
       FROM exercise_library
       WHERE ($1::text IS NULL OR $1 = ANY(primary_muscles))
         AND ($2::text IS NULL OR equipment = $2)
       ORDER BY name
       LIMIT $3`,
      params
    );
  });

  // Single exercise detail (for the "how to" card)
  app.get("/library/:id", async (req) => {
    const { id } = req.params as any;
    const rows = await query(
      `SELECT id, name, category, equipment, primary_muscles, secondary_muscles, instructions, images
       FROM exercise_library WHERE id = $1`,
      [id]
    );
    if (!rows[0]) throw { statusCode: 404, message: "Not found" };
    return rows[0];
  });

  // ── Sessions ──────────────────────────────────────────────────────────────────
  app.post("/sessions", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>(
      `INSERT INTO exercise_sessions (user_id) VALUES ($1) RETURNING id, started_at`,
      [user_id]
    );
    return rows[0];
  });

  app.get("/sessions", async (req) => {
    const user_id = req.user_id;
    const { limit = "20", offset = "0" } = req.query as any;
    const lim = Math.min(parseInt(limit, 10) || 20, 50);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const sessions = await query<any>(
      `SELECT
         s.id, s.started_at, s.ended_at,
         EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at))::int AS duration_seconds,
         COUNT(e.id)::int AS entry_count,
         ARRAY_AGG(DISTINCT lib.name ORDER BY lib.name) FILTER (WHERE lib.name IS NOT NULL) AS exercise_names
       FROM exercise_sessions s
       LEFT JOIN exercise_log_entries e ON e.session_id = s.id
       LEFT JOIN exercise_library lib ON lib.id = e.exercise_id
       WHERE s.user_id = $1
       GROUP BY s.id, s.started_at, s.ended_at
       ORDER BY s.started_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, lim, off]
    );
    return sessions;
  });

  app.get("/sessions/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;

    const [sessionRows, entryRows, settingsRows] = await Promise.all([
      query<any>(
        `SELECT id, started_at, ended_at,
           EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))::int AS duration_seconds
         FROM exercise_sessions WHERE id = $1 AND user_id = $2`,
        [id, user_id]
      ),
      query<any>(
        `SELECT
           e.id, e.sets, e.reps, e.duration_seconds, e.logged_at, e.sort_order,
           lib.id AS exercise_id, lib.name, lib.category, lib.equipment,
           lib.primary_muscles, lib.images
         FROM exercise_log_entries e
         JOIN exercise_library lib ON lib.id = e.exercise_id
         WHERE e.session_id = $1
         ORDER BY e.sort_order, e.logged_at`,
        [id]
      ),
      query<any>(`SELECT settings FROM user_settings WHERE user_id = $1`, [user_id]),
    ]);

    if (!sessionRows[0]) throw { statusCode: 404, message: "Session not found" };
    const session = sessionRows[0];

    const entries = entryRows.map((r) => ({
      id: r.id,
      sets: r.sets,
      reps: r.reps,
      duration_seconds: r.duration_seconds,
      logged_at: r.logged_at,
      sort_order: r.sort_order,
      exercise: {
        id: r.exercise_id,
        name: r.name,
        category: r.category,
        equipment: r.equipment,
        primary_muscles: r.primary_muscles,
        images: r.images,
      },
    }));

    let hr_summary = null;
    let hr_samples: any[] = [];

    if (session.ended_at) {
      const settings = settingsRows[0]?.settings ?? {};
      const birthdate: string | undefined = settings.profile?.birthdate;
      const age = birthdate
        ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 3600 * 1000))
        : null;

      [hr_summary, hr_samples] = await Promise.all([
        computeSessionHRSummary(user_id, session, age, query),
        query<any>(
          `SELECT recorded_at, bpm FROM heart_rate_readings
           WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3
           ORDER BY recorded_at`,
          [user_id, session.started_at, session.ended_at]
        ),
      ]);
    }

    return { ...session, entries, hr_summary, hr_samples };
  });

  app.patch("/sessions/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const { ended_at } = (req.body as any) ?? {};

    const ts = ended_at ? new Date(ended_at) : new Date();
    const rows = await query<any>(
      `UPDATE exercise_sessions SET ended_at = $1
       WHERE id = $2 AND user_id = $3 AND ended_at IS NULL
       RETURNING id, started_at, ended_at`,
      [ts, id, user_id]
    );
    if (!rows[0]) throw { statusCode: 404, message: "Session not found or already finished" };
    return rows[0];
  });

  // ── Log entries ───────────────────────────────────────────────────────────────
  app.post("/sessions/:id/entries", async (req) => {
    const user_id = req.user_id;
    const { id: session_id } = req.params as any;
    const { exercise_id, sets, reps, duration_seconds } = req.body as any;

    // Verify session belongs to this user and is still open
    const sessionRows = await query<any>(
      `SELECT id FROM exercise_sessions WHERE id = $1 AND user_id = $2 AND ended_at IS NULL`,
      [session_id, user_id]
    );
    if (!sessionRows[0]) throw { statusCode: 404, message: "Session not found or already finished" };

    // Determine sort_order (append to end)
    const countRows = await query<any>(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM exercise_log_entries WHERE session_id = $1`,
      [session_id]
    );
    const sort_order = (countRows[0]?.max_order ?? -1) + 1;

    const rows = await query<any>(
      `INSERT INTO exercise_log_entries (session_id, exercise_id, sets, reps, duration_seconds, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, session_id, exercise_id, sets, reps, duration_seconds, logged_at, sort_order`,
      [session_id, exercise_id, sets ?? null, reps ?? null, duration_seconds ?? null, sort_order]
    );
    return rows[0];
  });

  app.delete("/log-entries/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;

    // Verify ownership via session → user
    const rows = await query<any>(
      `DELETE FROM exercise_log_entries e
       USING exercise_sessions s
       WHERE e.id = $1 AND e.session_id = s.id AND s.user_id = $2
       RETURNING e.id`,
      [id, user_id]
    );
    if (!rows[0]) throw { statusCode: 404, message: "Entry not found" };
    return { ok: true };
  });
}
