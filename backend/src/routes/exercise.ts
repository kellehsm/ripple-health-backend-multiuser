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
           e.weight_used, e.target_rep_range_min, e.target_rep_range_max,
           e.actual_reps_per_set, e.all_sets_maxed,
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
      weight_used: r.weight_used,
      target_rep_range_min: r.target_rep_range_min,
      target_rep_range_max: r.target_rep_range_max,
      actual_reps_per_set: r.actual_reps_per_set,
      all_sets_maxed: r.all_sets_maxed,
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

  // ── Smart suggestion (priority waterfall — matches /cycle/overview-insight) ──
  app.get("/suggestion", async (req) => {
    const user_id = req.user_id;
    const today_dow = new Date().getDay(); // 0=Sun…6=Sat
    const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

    const [
      daysSinceMuscle,
      neverLogged,
      preferredDays,
      weekCount,
      completion,
      recentSessions,
    ] = await Promise.all([
      query<any>(
        `SELECT muscle, EXTRACT(DAY FROM (now() - MAX(s.started_at)))::int AS days_since
         FROM exercise_sessions s
         JOIN exercise_log_entries e ON e.session_id = s.id
         JOIN exercise_library lib ON lib.id = e.exercise_id
         JOIN LATERAL unnest(lib.primary_muscles) AS muscle ON true
         WHERE s.user_id = $1
         GROUP BY muscle`,
        [user_id]
      ),
      query<any>(
        `SELECT DISTINCT lib.id, lib.name, lib.primary_muscles
         FROM workout_programs wp
         JOIN workout_program_days wpd ON wpd.program_id = wp.id
         JOIN workout_program_exercises wpe ON wpe.day_id = wpd.id
         JOIN exercise_library lib ON lib.id = wpe.exercise_id
         WHERE wp.user_id = $1 AND wp.is_active = true
           AND lib.id NOT IN (
             SELECT e.exercise_id
             FROM exercise_log_entries e
             JOIN exercise_sessions s ON s.id = e.session_id
             WHERE s.user_id = $1
           )
         LIMIT 1`,
        [user_id]
      ),
      query<any>(
        `SELECT EXTRACT(DOW FROM started_at)::int AS day_of_week
         FROM exercise_sessions
         WHERE user_id = $1 AND ended_at IS NOT NULL
         GROUP BY day_of_week
         ORDER BY COUNT(*) DESC
         LIMIT 3`,
        [user_id]
      ),
      query<any>(
        `SELECT COUNT(*)::int AS count
         FROM exercise_sessions
         WHERE user_id = $1 AND ended_at IS NOT NULL
           AND started_at >= date_trunc('week', now())`,
        [user_id]
      ),
      query<any>(
        `SELECT COUNT(*)::int AS total, COUNT(ended_at)::int AS completed
         FROM exercise_sessions WHERE user_id = $1`,
        [user_id]
      ),
      query<any>(
        `SELECT started_at FROM exercise_sessions
         WHERE user_id = $1 AND ended_at IS NOT NULL
         ORDER BY started_at DESC LIMIT 4`,
        [user_id]
      ),
    ]);

    const sessionsThisWeek: number = weekCount[0]?.count ?? 0;
    const total: number = completion[0]?.total ?? 0;
    const completed: number = completion[0]?.completed ?? 0;
    const ratePct = total > 0 ? Math.round(completed / total * 100) : null;
    const preferredDowSet = new Set(preferredDays.map((r: any) => r.day_of_week));

    // Find most-neglected primary muscle (longest gap, >= 7 days)
    const neglected = daysSinceMuscle
      .filter((r: any) => r.days_since >= 7)
      .sort((a: any, b: any) => b.days_since - a.days_since)[0] ?? null;

    // Check if last 4 completed sessions all fell within the past 4 calendar days
    const overtraining = (() => {
      if (recentSessions.length < 4) return false;
      const earliest = new Date(recentSessions[3].started_at);
      const latest   = new Date(recentSessions[0].started_at);
      return (latest.getTime() - earliest.getTime()) / 86400000 <= 3;
    })();

    // ── Waterfall ────────────────────────────────────────────────────────────
    if (total === 0) {
      return { type: "no_history", title: "Start your first session", body: "Track your workouts to unlock personalized suggestions here.", cta: "Start session", data: null };
    }

    if (overtraining) {
      return { type: "rest_day", title: "Time to recover", body: "You've trained 4 days in a row — rest is when adaptations happen.", cta: null, data: null };
    }

    if (neglected) {
      const m = neglected.muscle.charAt(0).toUpperCase() + neglected.muscle.slice(1);
      return { type: "neglected_muscle", title: `${m} needs attention`, body: `You haven't trained ${neglected.muscle} in ${neglected.days_since} days. Consider adding it today.`, cta: "Start session", data: { muscle: neglected.muscle, days_since: neglected.days_since } };
    }

    if (neverLogged.length > 0) {
      const ex = neverLogged[0];
      return { type: "program_gap", title: "Try something from your plan", body: `"${ex.name}" is in your program but you haven't logged it yet.`, cta: "Start session", data: { exercise: ex } };
    }

    if (preferredDowSet.has(today_dow) && sessionsThisWeek === 0) {
      return { type: "preferred_day", title: `${DAY_NAMES[today_dow]} is your day`, body: `You typically train on ${DAY_NAMES[today_dow]}s. Ready to keep the streak going?`, cta: "Start session", data: { day_of_week: today_dow } };
    }

    if (sessionsThisWeek >= 3) {
      return { type: "consistency_streak", title: `${sessionsThisWeek} sessions this week`, body: "Great consistency. Habits built over weeks become automatic.", cta: null, data: { week_count: sessionsThisWeek } };
    }

    if (ratePct !== null && ratePct < 60 && total >= 3) {
      return { type: "low_completion", title: "Finish what you start", body: `You complete about ${ratePct}% of your sessions. Shorter workouts are better than abandoned ones.`, cta: null, data: { rate_pct: ratePct } };
    }

    return { type: "generic", title: "Keep it going", body: `You've finished ${completed} workout${completed !== 1 ? "s" : ""}. Every session counts.`, cta: null, data: null };
  });

  // ── Double progression (deterministic weight advice) ─────────────────────────
  app.get("/progression/:exercise_id", async (req) => {
    const user_id = req.user_id;
    const { exercise_id } = req.params as any;

    // Most recent entry for this exercise that has weight tracking
    const rows = await query<any>(
      `SELECT e.weight_used, e.target_rep_range_min, e.target_rep_range_max,
              e.actual_reps_per_set, e.all_sets_maxed, e.sets, e.reps, e.logged_at,
              lib.primary_muscles
       FROM exercise_log_entries e
       JOIN exercise_sessions s ON s.id = e.session_id
       JOIN exercise_library lib ON lib.id = e.exercise_id
       WHERE s.user_id = $1 AND e.exercise_id = $2 AND e.weight_used IS NOT NULL
       ORDER BY e.logged_at DESC
       LIMIT 1`,
      [user_id, exercise_id]
    );

    if (!rows[0]) {
      return { exercise_id, recommendation: "no_data", message: "No weighted history yet." };
    }

    const last = rows[0];
    const SMALL_MUSCLES = new Set(["biceps","triceps","calves","forearms","neck","abductors","adductors"]);
    const isIsolation = (last.primary_muscles as string[]).some((m) => SMALL_MUSCLES.has(m));
    const increment = isIsolation ? 2.5 : 5;
    const current = Number(last.weight_used);

    if (last.all_sets_maxed === true) {
      const suggested = current + increment;
      return {
        exercise_id,
        last_logged_at: last.logged_at,
        current_weight: current,
        target_rep_range_min: last.target_rep_range_min,
        target_rep_range_max: last.target_rep_range_max,
        all_sets_maxed: true,
        recommendation: "increase_weight",
        suggested_weight: suggested,
        increment,
        message: `All sets maxed at ${current} lbs — add ${increment} lbs next time (try ${suggested} lbs).`,
      };
    }

    // Not all maxed — find how many reps short of target on the worst set
    const worstReps = Array.isArray(last.actual_reps_per_set) && last.actual_reps_per_set.length > 0
      ? Math.min(...last.actual_reps_per_set)
      : null;
    const gapMsg = worstReps !== null && last.target_rep_range_max != null
      ? ` (got ${worstReps} on your hardest set, targeting ${last.target_rep_range_max})`
      : "";

    return {
      exercise_id,
      last_logged_at: last.logged_at,
      current_weight: current,
      target_rep_range_min: last.target_rep_range_min,
      target_rep_range_max: last.target_rep_range_max,
      all_sets_maxed: false,
      recommendation: "maintain",
      suggested_weight: current,
      increment,
      message: `Stick with ${current} lbs${gapMsg} — hit all sets at the top of your range before adding weight.`,
    };
  });

  // ── Preferences (8 pure-SQL aggregates for Phase 5 suggestion engine) ────────
  app.get("/preferences", async (req) => {
    const user_id = req.user_id;

    const [
      favoriteRows,
      neverLoggedRows,
      durationRow,
      preferredDayRows,
      muscleRows,
      equipmentRows,
      completionRow,
      daysSinceMuscleRows,
    ] = await Promise.all([
      // 1. Top exercises by log frequency
      query<any>(
        `SELECT lib.id, lib.name, lib.primary_muscles, COUNT(*)::int AS times_logged
         FROM exercise_log_entries e
         JOIN exercise_sessions s ON s.id = e.session_id
         JOIN exercise_library lib ON lib.id = e.exercise_id
         WHERE s.user_id = $1
         GROUP BY lib.id, lib.name, lib.primary_muscles
         ORDER BY times_logged DESC
         LIMIT 10`,
        [user_id]
      ),

      // 2. Exercises in active program that have never been logged
      query<any>(
        `SELECT DISTINCT lib.id, lib.name, lib.primary_muscles
         FROM workout_programs wp
         JOIN workout_program_days wpd ON wpd.program_id = wp.id
         JOIN workout_program_exercises wpe ON wpe.day_id = wpd.id
         JOIN exercise_library lib ON lib.id = wpe.exercise_id
         WHERE wp.user_id = $1 AND wp.is_active = true
           AND lib.id NOT IN (
             SELECT e.exercise_id
             FROM exercise_log_entries e
             JOIN exercise_sessions s ON s.id = e.session_id
             WHERE s.user_id = $1
           )
         ORDER BY lib.name`,
        [user_id]
      ),

      // 3. Average completed session duration
      query<any>(
        `SELECT AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))::int AS avg_seconds
         FROM exercise_sessions
         WHERE user_id = $1 AND ended_at IS NOT NULL`,
        [user_id]
      ),

      // 4. Preferred days of week (0 = Sun … 6 = Sat)
      query<any>(
        `SELECT EXTRACT(DOW FROM started_at)::int AS day_of_week, COUNT(*)::int AS session_count
         FROM exercise_sessions
         WHERE user_id = $1 AND ended_at IS NOT NULL
         GROUP BY day_of_week
         ORDER BY session_count DESC`,
        [user_id]
      ),

      // 5. Most-targeted primary muscles
      query<any>(
        `SELECT muscle, COUNT(*)::int AS count
         FROM exercise_sessions s
         JOIN exercise_log_entries e ON e.session_id = s.id
         JOIN exercise_library lib ON lib.id = e.exercise_id
         JOIN LATERAL unnest(lib.primary_muscles) AS muscle ON true
         WHERE s.user_id = $1
         GROUP BY muscle
         ORDER BY count DESC
         LIMIT 10`,
        [user_id]
      ),

      // 6. Equipment actually used
      query<any>(
        `SELECT lib.equipment, COUNT(*)::int AS count
         FROM exercise_sessions s
         JOIN exercise_log_entries e ON e.session_id = s.id
         JOIN exercise_library lib ON lib.id = e.exercise_id
         WHERE s.user_id = $1 AND lib.equipment IS NOT NULL
         GROUP BY lib.equipment
         ORDER BY count DESC`,
        [user_id]
      ),

      // 7. Session completion rate
      query<any>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(ended_at)::int AS completed,
           ROUND(COUNT(ended_at)::numeric / NULLIF(COUNT(*), 0) * 100)::int AS rate_pct
         FROM exercise_sessions
         WHERE user_id = $1`,
        [user_id]
      ),

      // 8. Days since each primary muscle was last trained
      query<any>(
        `SELECT muscle, EXTRACT(DAY FROM (now() - MAX(s.started_at)))::int AS days_since
         FROM exercise_sessions s
         JOIN exercise_log_entries e ON e.session_id = s.id
         JOIN exercise_library lib ON lib.id = e.exercise_id
         JOIN LATERAL unnest(lib.primary_muscles) AS muscle ON true
         WHERE s.user_id = $1
         GROUP BY muscle
         ORDER BY days_since ASC`,
        [user_id]
      ),
    ]);

    return {
      favorite_exercises: favoriteRows,
      never_logged_program_exercises: neverLoggedRows,
      avg_session_duration_seconds: durationRow[0]?.avg_seconds ?? null,
      preferred_days: preferredDayRows,
      favorite_muscles: muscleRows,
      equipment_used: equipmentRows,
      completion_rate: completionRow[0] ?? { total: 0, completed: 0, rate_pct: null },
      days_since_muscle: daysSinceMuscleRows,
    };
  });

  // ── Log entries ───────────────────────────────────────────────────────────────
  app.post("/sessions/:id/entries", async (req) => {
    const user_id = req.user_id;
    const { id: session_id } = req.params as any;
    const {
      exercise_id, sets, reps, duration_seconds,
      weight_used, target_rep_range_min, target_rep_range_max, actual_reps_per_set,
    } = req.body as any;

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

    // Derive sets from actual_reps_per_set if not explicit
    const resolved_sets = sets ?? (Array.isArray(actual_reps_per_set) ? actual_reps_per_set.length : null);

    // all_sets_maxed: every set hit or exceeded the top of the rep range
    const all_sets_maxed =
      Array.isArray(actual_reps_per_set) && actual_reps_per_set.length > 0 && target_rep_range_max != null
        ? actual_reps_per_set.every((r: number) => r >= target_rep_range_max)
        : null;

    const rows = await query<any>(
      `INSERT INTO exercise_log_entries
         (session_id, exercise_id, sets, reps, duration_seconds, sort_order,
          weight_used, target_rep_range_min, target_rep_range_max, actual_reps_per_set, all_sets_maxed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, session_id, exercise_id, sets, reps, duration_seconds, logged_at, sort_order,
                 weight_used, target_rep_range_min, target_rep_range_max, actual_reps_per_set, all_sets_maxed`,
      [
        session_id, exercise_id, resolved_sets ?? null, reps ?? null,
        duration_seconds ?? null, sort_order,
        weight_used ?? null, target_rep_range_min ?? null, target_rep_range_max ?? null,
        Array.isArray(actual_reps_per_set) && actual_reps_per_set.length > 0 ? actual_reps_per_set : null,
        all_sets_maxed,
      ]
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
