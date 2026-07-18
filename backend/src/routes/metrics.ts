import { FastifyInstance } from "fastify";
import { query } from "../db.js";

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
  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { name, value_type, unit, icon, color_key } = req.body as any;
    const rows = await query(
      `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [user_id, name, value_type, unit, icon, color_key]
    );
    return rows[0];
  });

  // Log a value for a metric (e.g. "8 glasses of water")
  app.post("/:metricId/logs", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const { value, note, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO metric_logs (metric_id, value, note, logged_at)
       VALUES ($1,$2,$3, COALESCE($4, now())) RETURNING *`,
      [metricId, value, note, logged_at]
    );
    return rows[0];
  });

  // Get recent logs for one metric
  app.get("/:metricId/logs", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    return query(
      `SELECT * FROM metric_logs WHERE metric_id = $1 ORDER BY logged_at DESC LIMIT 100`,
      [metricId]
    );
  });

  // Yesterday total + 7-day average
  app.get("/:metricId/stats", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const [yesterday] = await query<any>(
      `SELECT COALESCE(SUM(value), 0) as total FROM metric_logs
       WHERE metric_id = $1 AND logged_at::date = current_date - interval '1 day'`,
      [metricId]
    );
    const [weekAvg] = await query<any>(
      `SELECT COALESCE(AVG(daily_total), 0) as avg FROM (
         SELECT logged_at::date as day, SUM(value) as daily_total
         FROM metric_logs
         WHERE metric_id = $1 AND logged_at >= current_date - interval '7 days'
         GROUP BY logged_at::date
       ) sub`,
      [metricId]
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
    const parsedWsd = parseInt(week_start_day, 10);
    const startDay = Math.max(0, Math.min(6, isNaN(parsedWsd) ? 1 : parsedWsd));
    const aggFn = agg === "sum" ? "SUM" : "MAX";

    const [ws] = await query<any>(
      `SELECT (date_trunc('day', now()) - ((EXTRACT(DOW FROM now())::int - $1 + 7) % 7) * INTERVAL '1 day')::date AS week_start`,
      [startDay]
    );
    const toStr = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    const weekStart = toStr(ws.week_start);

    const thisWeekRows = await query<any>(
      `SELECT
         d::date AS date,
         TRIM(TO_CHAR(d, 'Dy')) AS day_label,
         CASE WHEN d::date > current_date THEN 0
           ELSE COALESCE(
             (SELECT ${aggFn}(value) FROM metric_logs WHERE metric_id = $1 AND logged_at::date = d::date),
             0
           )
         END AS total,
         (d::date = current_date) AS is_today,
         (d::date > current_date) AS is_future
       FROM generate_series($2::date, $2::date + INTERVAL '6 days', INTERVAL '1 day') AS d
       ORDER BY d`,
      [metricId, weekStart]
    );

    const lastWeekRows = await query<any>(
      `SELECT
         d::date AS date,
         TRIM(TO_CHAR(d, 'Dy')) AS day_label,
         COALESCE(
           (SELECT ${aggFn}(value) FROM metric_logs WHERE metric_id = $1 AND logged_at::date = d::date),
           0
         ) AS total
       FROM generate_series($2::date - INTERVAL '7 days', $2::date - INTERVAL '1 day', INTERVAL '1 day') AS d
       ORDER BY d`,
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
    const parsedWsd = parseInt(week_start_day, 10);
    const startDay = Math.max(0, Math.min(6, isNaN(parsedWsd) ? 1 : parsedWsd));
    const aggFn = agg === "sum" ? "SUM" : "MAX";

    const [ws] = await query<any>(
      `SELECT (date_trunc('day', now()) - ((EXTRACT(DOW FROM now())::int - $1 + 7) % 7) * INTERVAL '1 day')::date AS week_start`,
      [startDay]
    );
    const toStr = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
    const thisWeekStart = toStr(ws.week_start);

    // Build 4 pairs: offset 0..3 weeks back (recent) vs same offset + 4 weeks back (prior)
    const weeks = await Promise.all(
      [0, 1, 2, 3].map(async (offset) => {
        const recentStart = `$1::date - (${offset} * INTERVAL '7 days')`;
        const priorStart  = `$1::date - (${offset + 4} * INTERVAL '7 days')`;

        const recentRows = await query<any>(
          `SELECT COALESCE(SUM(day_val), 0) AS total,
                  MIN(d)::date AS week_start_date
           FROM (
             SELECT logged_at::date AS d, ${aggFn}(value) AS day_val
             FROM metric_logs
             WHERE metric_id = $2
               AND logged_at::date >= ${recentStart}
               AND logged_at::date < ${recentStart} + INTERVAL '7 days'
             GROUP BY logged_at::date
           ) t`,
          [thisWeekStart, metricId]
        );
        const priorRows = await query<any>(
          `SELECT COALESCE(SUM(day_val), 0) AS total
           FROM (
             SELECT logged_at::date AS d, ${aggFn}(value) AS day_val
             FROM metric_logs
             WHERE metric_id = $2
               AND logged_at::date >= ${priorStart}
               AND logged_at::date < ${priorStart} + INTERVAL '7 days'
             GROUP BY logged_at::date
           ) t`,
          [thisWeekStart, metricId]
        );

        // Compute the week_start_date for display even when there are no logs
        const [dateRow] = await query<any>(
          `SELECT (${recentStart})::date AS week_start_date`,
          [thisWeekStart]
        );

        const recentTotal = Number(recentRows[0]?.total ?? 0);
        const priorTotal  = Number(priorRows[0]?.total ?? 0);
        const changePct   = priorTotal > 0
          ? Math.round(((recentTotal - priorTotal) / priorTotal) * 100)
          : null;

        const weekStartDate = toStr(dateRow.week_start_date);
        const label = new Date(weekStartDate + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric" });

        return {
          week_offset: offset,
          week_start_date: weekStartDate,
          week_label: label,
          is_current: offset === 0,
          recent_total: recentTotal,
          prior_total: priorTotal,
          change_pct: changePct,
        };
      })
    );

    // weeks[0] = current week, weeks[3] = 3 weeks ago — reverse so oldest first
    return weeks.reverse();
  });

  // Weekly total, respecting a configurable week-start day (0=Sun, 1=Mon default).
  // Uses MAX per day then SUM — steps are stored as cumulative daily totals per sync.
  app.get("/:metricId/weekly-total", async (req, reply) => {
    const { metricId } = req.params as any;
    if (!await verifyOwner(metricId, req.user_id)) return reply.code(404).send({ error: "not found" });
    const { week_start_day = "1", agg = "max" } = req.query as any;
    const parsed = parseInt(week_start_day, 10);
    const startDay = Math.max(0, Math.min(6, isNaN(parsed) ? 1 : parsed));
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
