import { FastifyInstance } from "fastify";
import { query } from "../db.js";

async function getOrCreateMetricId(user_id: string): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM metrics WHERE user_id = $1 AND name = 'mindfulness'`,
    [user_id]
  );
  if (existing.length > 0) return existing[0].id;
  const [created] = await query<{ id: string }>(
    `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
     VALUES ($1, 'mindfulness', 'number', 'sessions', 'meditation', 'teal')
     RETURNING id`,
    [user_id]
  );
  return created.id;
}

export default async function mindfulnessRoutes(app: FastifyInstance) {
  // POST /api/mindfulness/log — log a mindfulness session
  app.post("/log", async (req, reply) => {
    const user_id = req.user_id;
    const { type, duration_seconds, mood_before, mood_after } = req.body as any;
    if (!type) return reply.code(400).send({ error: "type is required" });

    const metricId = await getOrCreateMetricId(user_id);

    // Structured note: "type:box duration:120s before:2 after:4" — insight rules
    // only key off day presence, so extra fields are safe to append.
    const parts = [`type:${type}`];
    if (duration_seconds != null) parts.push(`duration:${duration_seconds}s`);
    if (mood_before != null) parts.push(`before:${mood_before}`);
    if (mood_after != null) parts.push(`after:${mood_after}`);

    await query(
      `INSERT INTO metric_logs (metric_id, value, note, logged_at)
       VALUES ($1, 1, $2, NOW())`,
      [metricId, parts.join(" ")]
    );

    return { ok: true };
  });

  // GET /api/mindfulness/stats — streak, totals, heatmap days, mood lift
  app.get("/stats", async (req) => {
    const user_id = req.user_id;

    const rows = await query<{
      day: string;
      sessions: string;
      minutes: string | null;
      deltas: string | null;
      delta_count: string | null;
    }>(
      `SELECT ml.logged_at::date::text AS day,
              COUNT(*)::text AS sessions,
              (COALESCE(SUM((substring(ml.note FROM 'duration:(\\d+)s'))::int), 0) / 60)::text AS minutes,
              SUM(
                CASE WHEN ml.note ~ 'before:\\d' AND ml.note ~ 'after:\\d'
                  THEN (substring(ml.note FROM 'after:(\\d+)'))::int - (substring(ml.note FROM 'before:(\\d+)'))::int
                  ELSE 0 END
              )::text AS deltas,
              COUNT(*) FILTER (WHERE ml.note ~ 'before:\\d' AND ml.note ~ 'after:\\d')::text AS delta_count
       FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'mindfulness'
         AND ml.logged_at >= CURRENT_DATE - 84
       GROUP BY ml.logged_at::date
       ORDER BY ml.logged_at::date`,
      [user_id]
    );

    const totals = await query<{ sessions: string; minutes: string | null }>(
      `SELECT COUNT(*)::text AS sessions,
              (COALESCE(SUM((substring(ml.note FROM 'duration:(\\d+)s'))::int), 0) / 60)::text AS minutes
       FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'mindfulness'`,
      [user_id]
    );

    const byType = await query<{ type: string; sessions: string }>(
      `SELECT substring(ml.note FROM 'type:([a-z0-9_]+)') AS type, COUNT(*)::text AS sessions
       FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'mindfulness' AND ml.note ~ 'type:'
       GROUP BY 1 ORDER BY 2 DESC`,
      [user_id]
    );

    const days = rows.map((r) => ({
      day: r.day,
      sessions: parseInt(r.sessions, 10),
      minutes: parseInt(r.minutes ?? "0", 10),
    }));

    // Streak: consecutive practice days ending today (or yesterday, so the
    // streak isn't "broken" before the user has had a chance to practice today).
    // Grace: one skipped day per rolling 7-day window is silently forgiven, so
    // an isolated miss doesn't wipe out weeks of practice.
    const daySet = new Set(days.map((d) => d.day));
    const msDay = 86400000;
    // Anchor on server-local today (same clock the metric_logs INSERTs use).
    // JS's new Date().toISOString() is UTC — on evenings when UTC has already
    // ticked to tomorrow, the streak walker starts one day past every log
    // and reports zero. Ask the DB directly so we stay aligned with writers.
    const [todayRow] = await query<{ today: string }>(
      `SELECT CURRENT_DATE::text AS today`
    );
    const todayStr = todayRow?.today ?? new Date().toISOString().slice(0, 10);
    let cursor = daySet.has(todayStr)
      ? Date.parse(todayStr)
      : Date.parse(todayStr) - msDay;
    let streak = 0;
    let graceUsed = false;
    while (true) {
      const cursorStr = new Date(cursor).toISOString().slice(0, 10);
      if (daySet.has(cursorStr)) {
        streak++;
        cursor -= msDay;
      } else if (!graceUsed && streak >= 2) {
        // One-day grace: skip a single missed day, then require an unbroken run
        graceUsed = true;
        cursor -= msDay;
      } else {
        break;
      }
    }

    const weekCutoff = new Date(Date.parse(todayStr) - 6 * msDay).toISOString().slice(0, 10);
    const weekDays = days.filter((d) => d.day >= weekCutoff);

    let deltaSum = 0;
    let deltaCount = 0;
    for (const r of rows) {
      deltaSum += parseInt(r.deltas ?? "0", 10);
      deltaCount += parseInt(r.delta_count ?? "0", 10);
    }

    return {
      streak,
      practiced_today: daySet.has(todayStr),
      week_sessions: weekDays.reduce((a, d) => a + d.sessions, 0),
      week_minutes: weekDays.reduce((a, d) => a + d.minutes, 0),
      total_sessions: parseInt(totals[0]?.sessions ?? "0", 10),
      total_minutes: parseInt(totals[0]?.minutes ?? "0", 10),
      avg_mood_delta: deltaCount > 0 ? Math.round((deltaSum / deltaCount) * 10) / 10 : null,
      mood_delta_sessions: deltaCount,
      days,
      by_type: byType.map((t) => ({ type: t.type, sessions: parseInt(t.sessions, 10) })),
    };
  });

  // GET /api/mindfulness/journal — past gratitude entries (newest first)
  app.get("/journal", async (req) => {
    const user_id = req.user_id;
    return query(
      `SELECT id, entry_text, logged_at
       FROM journal_entries
       WHERE user_id = $1 AND mood_label = 'Grateful'
         AND entry_text IS NOT NULL AND entry_text != ''
       ORDER BY logged_at DESC
       LIMIT 100`,
      [user_id]
    );
  });
}
