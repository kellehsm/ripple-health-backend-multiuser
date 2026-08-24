import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { parseWeekStartDay } from "../lib/weekStartDay.js";
import { getUserTz } from "../lib/userTz.js";

// Matches the documented values on metrics.value_type in schema.sql
const ALLOWED_VALUE_TYPES = ["number", "duration_minutes", "scale_1_5", "boolean"];

// Generic metric engine: water, screen time, meds, workouts, etc.
export default async function metricsRoutes(app: FastifyInstance) {
  async function verifyOwner(metricId: string, userId: string): Promise<boolean> {
    const [row] = await query<any>(
      `SELECT id FROM metrics WHERE id = $1 AND user_id = $2`,
      [metricId, userId]
    );
    return !!row;
  }
  // List metric types; supports ?name= filter. user_id is required (auth middleware sets it).
  app.get("/", async (req, reply) => {
    const user_id = req.user_id;
    if (!user_id) return reply.code(401).send({ error: "Unauthorized" });
    const { name } = req.query as any;
    const conditions: string[] = ["user_id = $1"];
    const params: any[] = [user_id];
    if (name) { params.push(name); conditions.push("name = $" + params.length); }
    const where = " WHERE " + conditions.join(" AND ");
    return query("SELECT * FROM metrics" + where + " ORDER BY name", params);
  });

  // Create a new metric type (e.g. adding "meditation" later)
  app.post("/", async (req, reply) => {
    const user_id = req.user_id;
    const { name, value_type, unit, icon, color_key } = req.body as any;
    if (typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "name is required" });
    }
    if (value_type != null && !ALLOWED_VALUE_TYPES.includes(value_type)) {
      return reply.status(400).send({ error: `value_type must be one of: ${ALLOWED_VALUE_TYPES.join(", ")}` });
    }
    if (unit != null && (typeof unit !== "string" || unit.length > 32)) {
      return reply.status(400).send({ error: "unit must be a string of at most 32 characters" });
    }
    // Idempotent per (user_id, name): return the existing metric instead of
    // creating a duplicate (unique index added in migration 050).
    const [existing] = await query(
      `SELECT * FROM metrics WHERE user_id = $1 AND name = $2 ORDER BY id LIMIT 1`,
      [user_id, name]
    );
    if (existing) return existing;
    try {
      const rows = await query(
        `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [user_id, name, value_type ?? "number", unit, icon, color_key]
      );
      return rows[0];
    } catch (err: any) {
      if (err?.code === "23505") {
        // Concurrent create raced us — return the winner.
        const [row] = await query(
          `SELECT * FROM metrics WHERE user_id = $1 AND name = $2 ORDER BY id LIMIT 1`,
          [user_id, name]
        );
        if (row) return row;
      }
      throw err;
    }
  });

  // Today's water count + goal — used by the Android widget (no metricId required)
  app.get("/water/today", async (req) => {
    const user_id = req.user_id;
    const [row] = await query<any>(
      `SELECT COALESCE(SUM(ml.value), 0)::int AS count
       FROM metric_logs ml
       JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'water'
         AND ml.logged_at::date = current_date`,
      [user_id]
    );
    const [settings] = await query<any>(
      `SELECT settings FROM user_settings WHERE user_id = $1`,
      [user_id]
    );
    const goal = settings?.settings?.smart_notifications?.water_reminder?.goal ?? 8;
    return { count: row?.count ?? 0, goal };
  });

  // Log a value for a metric (e.g. "8 glasses of water")
  app.post("/:metricId/logs", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const { value, note, logged_at } = req.body as any;
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return reply.status(400).send({ error: "value must be a number" });
    }
    if (logged_at != null && Number.isNaN(Date.parse(logged_at))) {
      return reply.status(400).send({ error: "logged_at must be a valid date" });
    }
    const rows = await query(
      `INSERT INTO metric_logs (metric_id, value, note, logged_at)
       VALUES ($1,$2,$3, COALESCE($4, now())) RETURNING *`,
      [metricId, num, note, logged_at]
    );
    return rows[0];
  });

  // Batch-log multiple values for a metric in one round-trip (cap 100 entries).
  // POST /api/metrics/:metricId/logs/batch
  // Body: { entries: [{ value: number, logged_at?: string }] }
  app.post("/:metricId/logs/batch", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const { entries } = req.body as any;
    if (!Array.isArray(entries) || entries.length === 0) {
      return reply.status(400).send({ error: "entries must be a non-empty array" });
    }
    if (entries.length > 100) {
      return reply.status(400).send({ error: "Too many entries (max 100)" });
    }
    for (const e of entries) {
      if (!Number.isFinite(Number(e.value))) {
        return reply.status(400).send({ error: "each entry.value must be a finite number" });
      }
      if (e.logged_at != null && Number.isNaN(Date.parse(e.logged_at))) {
        return reply.status(400).send({ error: "each entry.logged_at must be a valid date string" });
      }
    }
    const rows = await query(
      `INSERT INTO metric_logs (metric_id, value, note, logged_at)
       SELECT $1, u.value, u.note, COALESCE(u.logged_at, now())
       FROM unnest($2::float8[], $3::text[], $4::timestamptz[]) AS u(value, note, logged_at)
       RETURNING *`,
      [
        metricId,
        entries.map((e: any) => Number(e.value)),
        entries.map((e: any) => e.note ?? null),
        entries.map((e: any) => e.logged_at ?? null),
      ]
    );
    return rows;
  });

  // Get recent logs for one metric
  app.get("/:metricId/logs", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    return query(
      `SELECT ml.* FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
       WHERE ml.metric_id = $1 AND m.user_id = $2 ORDER BY ml.logged_at DESC LIMIT 100`,
      [metricId, req.user_id]
    );
  });

  // Yesterday total + 7-day average
  app.get("/:metricId/stats", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const [yesterday] = await query<any>(
      `SELECT COALESCE(SUM(ml.value), 0) as total FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
       WHERE ml.metric_id = $1 AND m.user_id = $2 AND ml.logged_at::date = current_date - interval '1 day'`,
      [metricId, req.user_id]
    );
    const [weekAvg] = await query<any>(
      `SELECT COALESCE(AVG(daily_total), 0) as avg FROM (
         SELECT ml.logged_at::date as day, SUM(ml.value) as daily_total
         FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
         WHERE ml.metric_id = $1 AND m.user_id = $2 AND ml.logged_at >= current_date - interval '7 days'
         GROUP BY ml.logged_at::date
       ) sub`,
      [metricId, req.user_id]
    );
    return { yesterday_total: Number(yesterday.total), seven_day_average: Number(weekAvg.avg) };
  });

  // Per-day totals for both the current week and previous week, plus aggregate stats.
  // agg=max (default) for cumulative metrics (steps); agg=sum for discrete logs (water).
  // this_week has 7 slots from week_start; future slots carry is_future=true and total=0.
  // Identical week-boundary formula to weekly-total so they never disagree.
  app.get("/:metricId/daily-breakdown", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const { week_start_day = "1", agg = "max" } = req.query as any;
    const startDay = parseWeekStartDay(week_start_day);
    const aggFn = agg === "sum" ? "SUM" : "MAX";
    const tz = await getUserTz(req.user_id);

    const toStr = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    const weekStart = toStr(
      ((await query<any>(
        `SELECT ((now() AT TIME ZONE $2)::date - ((EXTRACT(DOW FROM now() AT TIME ZONE $2)::int - $1 + 7) % 7))::date AS week_start`,
        [startDay, tz]
      ))[0].week_start)
    );

    const thisWeekRows = await query<any>(
      `WITH day_series AS (
         SELECT generate_series($2::date, $2::date + INTERVAL '6 days', INTERVAL '1 day')::date AS d
       ),
       day_agg AS (
         SELECT (logged_at AT TIME ZONE $3)::date AS d, ${aggFn}(value) AS total
         FROM metric_logs
         WHERE metric_id = $1
           AND (logged_at AT TIME ZONE $3)::date >= $2::date
           AND (logged_at AT TIME ZONE $3)::date <= $2::date + INTERVAL '6 days'
         GROUP BY (logged_at AT TIME ZONE $3)::date
       )
       SELECT
         ds.d::date AS date,
         TRIM(TO_CHAR(ds.d, 'Dy')) AS day_label,
         CASE WHEN ds.d > (now() AT TIME ZONE $3)::date THEN 0 ELSE COALESCE(da.total, 0) END AS total,
         (ds.d = (now() AT TIME ZONE $3)::date) AS is_today,
         (ds.d > (now() AT TIME ZONE $3)::date) AS is_future
       FROM day_series ds
       LEFT JOIN day_agg da ON da.d = ds.d
       ORDER BY ds.d`,
      [metricId, weekStart, tz]
    );

    const lastWeekRows = await query<any>(
      `WITH day_series AS (
         SELECT generate_series($2::date - INTERVAL '7 days', $2::date - INTERVAL '1 day', INTERVAL '1 day')::date AS d
       ),
       day_agg AS (
         SELECT (logged_at AT TIME ZONE $3)::date AS d, ${aggFn}(value) AS total
         FROM metric_logs
         WHERE metric_id = $1
           AND (logged_at AT TIME ZONE $3)::date >= $2::date - INTERVAL '7 days'
           AND (logged_at AT TIME ZONE $3)::date < $2::date
         GROUP BY (logged_at AT TIME ZONE $3)::date
       )
       SELECT
         ds.d::date AS date,
         TRIM(TO_CHAR(ds.d, 'Dy')) AS day_label,
         COALESCE(da.total, 0) AS total
       FROM day_series ds
       LEFT JOIN day_agg da ON da.d = ds.d
       ORDER BY ds.d`,
      [metricId, weekStart, tz]
    );

    const thisWeek = thisWeekRows.map((r: any) => ({
      date: toStr(r.date),
      day_label: String(r.day_label),
      total: Number(r.total),
      is_today: r.is_today === true || r.is_today === "t",
      is_future: r.is_future === true || r.is_future === "t",
    }));

    const lastWeek = lastWeekRows.map((r: any) => ({
      date: toStr(r.date),
      day_label: String(r.day_label),
      total: Number(r.total),
    }));

    const nonFuture = thisWeek.filter((d: any) => !d.is_future);
    const thisWeekTotal = nonFuture.reduce((s: number, d: any) => s + d.total, 0);
    const lastWeekTotal = lastWeek.reduce((s: number, d: any) => s + d.total, 0);
    const thisWeekAverage = nonFuture.length > 0 ? Math.round(thisWeekTotal / nonFuture.length) : 0;
    const lastWeekAverage = Math.round(lastWeekTotal / 7);

    return {
      this_week: thisWeek,
      last_week: lastWeek,
      this_week_total: thisWeekTotal,
      last_week_total: lastWeekTotal,
      this_week_average: thisWeekAverage,
      last_week_average: lastWeekAverage,
    };
  });

  // 4-week vs prior-4-week comparison. Each element pairs one recent week with the
  // same week offset 4 weeks prior, so users can compare "this month" to "last month".
  app.get("/:metricId/monthly-breakdown", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const { week_start_day = "1", agg = "max" } = req.query as any;
    const startDay = parseWeekStartDay(week_start_day);
    const aggFn = agg === "sum" ? "SUM" : "MAX";
    const tz = await getUserTz(req.user_id);

    const toStr = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

    // Single query: compute all 8 week windows (4 recent + 4 prior) in one round-trip.
    // $1 = metricId, $2 = startDay (DOW integer for week boundary calculation), $3 = user tz.
    // Inner aggregates are bounded to the 8-week window (+ margin) so they don't
    // scan the metric's full history.
    const rows = await query<any>(
      `WITH base AS (
         SELECT (
           (now() AT TIME ZONE $3)::date - ((EXTRACT(DOW FROM now() AT TIME ZONE $3)::int - $2 + 7) % 7)
         )::date AS this_week_start
       ),
       recent_weeks AS (
         SELECT gs.n AS week_offset,
                (base.this_week_start - gs.n * INTERVAL '7 days')::date AS week_start
         FROM generate_series(0, 3) AS gs(n), base
       ),
       prior_weeks AS (
         SELECT gs.n AS week_offset,
                (base.this_week_start - (gs.n + 4) * INTERVAL '7 days')::date AS week_start
         FROM generate_series(0, 3) AS gs(n), base
       ),
       day_totals AS (
         SELECT (logged_at AT TIME ZONE $3)::date AS d, ${aggFn}(value) AS day_val
         FROM metric_logs
         WHERE metric_id = $1
           AND logged_at >= now() - INTERVAL '60 days'
         GROUP BY (logged_at AT TIME ZONE $3)::date
       ),
       recent_totals AS (
         SELECT rw.week_offset,
                COALESCE(SUM(day_val), 0) AS total
         FROM recent_weeks rw
         LEFT JOIN day_totals dl ON dl.d >= rw.week_start AND dl.d < rw.week_start + INTERVAL '7 days'
         GROUP BY rw.week_offset
       ),
       prior_totals AS (
         SELECT pw.week_offset,
                COALESCE(SUM(day_val), 0) AS total
         FROM prior_weeks pw
         LEFT JOIN day_totals dl ON dl.d >= pw.week_start AND dl.d < pw.week_start + INTERVAL '7 days'
         GROUP BY pw.week_offset
       )
       SELECT rw.week_offset,
              rw.week_start AS week_start_date,
              rt.total      AS recent_total,
              pt.total      AS prior_total
       FROM recent_weeks rw
       JOIN recent_totals rt ON rt.week_offset = rw.week_offset
       JOIN prior_totals  pt ON pt.week_offset = rw.week_offset
       ORDER BY rw.week_offset`,
      [metricId, startDay, tz]
    );

    const weeks = rows.map((r: any) => {
      const recentTotal = Number(r.recent_total);
      const priorTotal  = Number(r.prior_total);
      const changePct   = priorTotal > 0
        ? Math.round(((recentTotal - priorTotal) / priorTotal) * 100)
        : null;
      const weekStartDate = toStr(r.week_start_date);
      const label = new Date(weekStartDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return {
        week_offset: Number(r.week_offset),
        week_start_date: weekStartDate,
        week_label: label,
        is_current: Number(r.week_offset) === 0,
        recent_total: recentTotal,
        prior_total: priorTotal,
        change_pct: changePct,
      };
    });

    // weeks[0] = current week, weeks[3] = 3 weeks ago — reverse so oldest first
    return weeks.reverse();
  });

  // Weekly total, respecting a configurable week-start day (0=Sun, 1=Mon default).
  // Uses MAX per day then SUM — steps are stored as cumulative daily totals per sync.
  // Returns: { week_total, last_week_total, month_to_date_total }
  app.get("/:metricId/weekly-total", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const { week_start_day = "1", agg = "max" } = req.query as any;
    const startDay = parseWeekStartDay(week_start_day);
    const aggFn = agg === "sum" ? "SUM" : "MAX";
    const tz = await getUserTz(req.user_id);

    // Current week: from the most recent week-start day up to today (inclusive)
    const [thisWeek] = await query<any>(
      `SELECT COALESCE(SUM(day_val), 0) as total FROM (
         SELECT ${aggFn}(value) AS day_val
         FROM metric_logs
         WHERE metric_id = $1
           AND (logged_at AT TIME ZONE $3)::date >= ((now() AT TIME ZONE $3)::date - ((EXTRACT(DOW FROM now() AT TIME ZONE $3)::int - $2 + 7) % 7))::date
         GROUP BY (logged_at AT TIME ZONE $3)::date
       ) t`,
      [metricId, startDay, tz]
    );

    // Last week: the 7-day window immediately before the current week start
    const [lastWeek] = await query<any>(
      `SELECT COALESCE(SUM(day_val), 0) as total FROM (
         SELECT ${aggFn}(value) AS day_val
         FROM metric_logs
         WHERE metric_id = $1
           AND (logged_at AT TIME ZONE $3)::date >= ((now() AT TIME ZONE $3)::date - ((EXTRACT(DOW FROM now() AT TIME ZONE $3)::int - $2 + 7) % 7))::date - INTERVAL '7 days'
           AND (logged_at AT TIME ZONE $3)::date <  ((now() AT TIME ZONE $3)::date - ((EXTRACT(DOW FROM now() AT TIME ZONE $3)::int - $2 + 7) % 7))::date
         GROUP BY (logged_at AT TIME ZONE $3)::date
       ) t`,
      [metricId, startDay, tz]
    );

    // Month-to-date: 1st of current calendar month → today (user's local date)
    const [monthToDate] = await query<any>(
      `SELECT COALESCE(SUM(day_val), 0) as total FROM (
         SELECT ${aggFn}(value) AS day_val
         FROM metric_logs
         WHERE metric_id = $1
           AND (logged_at AT TIME ZONE $2)::date >= date_trunc('month', now() AT TIME ZONE $2)::date
         GROUP BY (logged_at AT TIME ZONE $2)::date
       ) t`,
      [metricId, tz]
    );

    return {
      week_total: Number(thisWeek.total),
      last_week_total: Number(lastWeek.total),
      month_to_date_total: Number(monthToDate.total),
    };
  });
}
