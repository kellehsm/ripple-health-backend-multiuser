import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { parseWeekStartDay } from "../lib/weekStartDay.js";

// Generic metric engine: water, screen time, meds, workouts, etc.
export default async function metricsRoutes(app: FastifyInstance) {
  async function verifyOwner(metricId: string, userId: string): Promise<boolean> {
    const [row] = await query<any>(
      `SELECT id FROM metrics WHERE id = $1 AND user_id = $2`,
      [metricId, userId]
    );
    return !!row;
  }
  // List metric types; supports ?user_id= and/or ?name= filters
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const { name } = req.query as any;
    const conditions: string[] = [];
    const params: any[] = [];
    if (user_id) { params.push(user_id); conditions.push("user_id = $" + params.length); }
    if (name) { params.push(name); conditions.push("name = $" + params.length); }
    const where = conditions.length ? " WHERE " + conditions.join(" AND ") : "";
    return query("SELECT * FROM metrics" + where + " ORDER BY name", params);
  });

  // Create a new metric type (e.g. adding "meditation" later)
  app.post("/", async (req, reply) => {
    const user_id = req.user_id;
    const { name, value_type, unit, icon, color_key } = req.body as any;
    if (typeof name !== "string" || !name.trim()) {
      return reply.status(400).send({ error: "name is required" });
    }
    const rows = await query(
      `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [user_id, name, value_type, unit, icon, color_key]
    );
    return rows[0];
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

    const toStr = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    const weekStart = toStr(
      ((await query<any>(
        `SELECT (date_trunc('day', now()) - ((EXTRACT(DOW FROM now())::int - $1 + 7) % 7) * INTERVAL '1 day')::date AS week_start`,
        [startDay]
      ))[0].week_start)
    );

    const thisWeekRows = await query<any>(
      `WITH day_series AS (
         SELECT generate_series($2::date, $2::date + INTERVAL '6 days', INTERVAL '1 day')::date AS d
       ),
       day_agg AS (
         SELECT logged_at::date AS d, ${aggFn}(value) AS total
         FROM metric_logs
         WHERE metric_id = $1
           AND logged_at::date >= $2::date
           AND logged_at::date <= $2::date + INTERVAL '6 days'
         GROUP BY logged_at::date
       )
       SELECT
         ds.d::date AS date,
         TRIM(TO_CHAR(ds.d, 'Dy')) AS day_label,
         CASE WHEN ds.d > current_date THEN 0 ELSE COALESCE(da.total, 0) END AS total,
         (ds.d = current_date) AS is_today,
         (ds.d > current_date) AS is_future
       FROM day_series ds
       LEFT JOIN day_agg da ON da.d = ds.d
       ORDER BY ds.d`,
      [metricId, weekStart]
    );

    const lastWeekRows = await query<any>(
      `WITH day_series AS (
         SELECT generate_series($2::date - INTERVAL '7 days', $2::date - INTERVAL '1 day', INTERVAL '1 day')::date AS d
       ),
       day_agg AS (
         SELECT logged_at::date AS d, ${aggFn}(value) AS total
         FROM metric_logs
         WHERE metric_id = $1
           AND logged_at::date >= $2::date - INTERVAL '7 days'
           AND logged_at::date < $2::date
         GROUP BY logged_at::date
       )
       SELECT
         ds.d::date AS date,
         TRIM(TO_CHAR(ds.d, 'Dy')) AS day_label,
         COALESCE(da.total, 0) AS total
       FROM day_series ds
       LEFT JOIN day_agg da ON da.d = ds.d
       ORDER BY ds.d`,
      [metricId, weekStart]
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

    const toStr = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

    // Single query: compute all 8 week windows (4 recent + 4 prior) in one round-trip.
    // $1 = metricId, $2 = startDay (DOW integer for week boundary calculation)
    const rows = await query<any>(
      `WITH base AS (
         SELECT (
           date_trunc('day', now()) - ((EXTRACT(DOW FROM now())::int - $2 + 7) % 7) * INTERVAL '1 day'
         )::date AS this_week_start
       ),
       recent_weeks AS (
         SELECT gs.offset AS week_offset,
                (base.this_week_start - gs.offset * INTERVAL '7 days')::date AS week_start
         FROM generate_series(0, 3) AS gs(offset), base
       ),
       prior_weeks AS (
         SELECT gs.offset AS week_offset,
                (base.this_week_start - (gs.offset + 4) * INTERVAL '7 days')::date AS week_start
         FROM generate_series(0, 3) AS gs(offset), base
       ),
       recent_totals AS (
         SELECT rw.week_offset,
                COALESCE(SUM(day_val), 0) AS total
         FROM recent_weeks rw
         LEFT JOIN (
           SELECT logged_at::date AS d, ${aggFn}(value) AS day_val
           FROM metric_logs
           WHERE metric_id = $1
           GROUP BY logged_at::date
         ) dl ON dl.d >= rw.week_start AND dl.d < rw.week_start + INTERVAL '7 days'
         GROUP BY rw.week_offset
       ),
       prior_totals AS (
         SELECT pw.week_offset,
                COALESCE(SUM(day_val), 0) AS total
         FROM prior_weeks pw
         LEFT JOIN (
           SELECT logged_at::date AS d, ${aggFn}(value) AS day_val
           FROM metric_logs
           WHERE metric_id = $1
           GROUP BY logged_at::date
         ) dl ON dl.d >= pw.week_start AND dl.d < pw.week_start + INTERVAL '7 days'
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
      [metricId, startDay]
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
  app.get("/:metricId/weekly-total", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const { week_start_day = "1", agg = "max" } = req.query as any;
    const startDay = parseWeekStartDay(week_start_day);
    const aggFn = agg === "sum" ? "SUM" : "MAX";
    const [result] = await query<any>(
      `SELECT COALESCE(SUM(day_val), 0) as total FROM (
         SELECT ${aggFn}(value) AS day_val
         FROM metric_logs
         WHERE metric_id = $1
           AND logged_at::date >= (date_trunc('day', now()) - ((EXTRACT(DOW FROM now())::int - $2 + 7) % 7) * INTERVAL '1 day')::date
         GROUP BY logged_at::date
       ) t`,
      [metricId, startDay]
    );
    return { week_total: Number(result.total) };
  });
}
