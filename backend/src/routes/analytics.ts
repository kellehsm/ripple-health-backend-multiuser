import { FastifyInstance } from "fastify";
import { query } from "../db.js";

/**
 * Pull a named key from the context JSONB column and compare its day-level
 * averages against another tracked metric (mood or glucose).
 *
 * GET /api/analytics/context-correlation
 *   ?user_id=...
 *   &key=social_battery          (context JSON key to extract)
 *   &compare_to=mood|glucose     (metric to correlate against)
 *   &days=30                     (lookback window, default 30, max 90)
 */
export default async function analyticsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { key: string; compare_to: string; days?: string } }>(
    "/context-correlation",
    async (req) => {
      const user_id = req.user_id;
      const { key, compare_to } = req.query;
      const days = Math.min(Math.max(parseInt(req.query.days ?? "30", 10) || 30, 7), 90);

      if (!key || !compare_to) {
        return { error: "key and compare_to are required" };
      }
      if (!["mood", "glucose"].includes(compare_to)) {
        return { error: "compare_to must be 'mood' or 'glucose'" };
      }

      let pairs: Array<{ date: string; context_val: number; metric_val: number }>;

      if (compare_to === "mood") {
        const rows = await query<any>(
          `SELECT
             logged_at::date AS date,
             AVG((context ->> $2)::float)  AS context_val,
             AVG(mood_score)               AS metric_val
           FROM journal_entries
           WHERE user_id = $1
             AND context ->> $2 IS NOT NULL
             AND (context ->> $2) ~ '^-?[0-9]+(\\.[0-9]+)?$'
             AND logged_at >= now() - ($3 * interval '1 day')
           GROUP BY logged_at::date
           ORDER BY date`,
          [user_id, key, days]
        );
        pairs = rows.map((r: any) => ({
          date: r.date,
          context_val: Number(Number(r.context_val).toFixed(2)),
          metric_val: Number(Number(r.metric_val).toFixed(2)),
        }));
      } else {
        // glucose: join daily average glucose against journal context
        const rows = await query<any>(
          `SELECT
             j.logged_at::date AS date,
             AVG((j.context ->> $2)::float)  AS context_val,
             AVG(g.mg_dl)                    AS metric_val
           FROM journal_entries j
           JOIN glucose_readings g
             ON g.user_id = j.user_id
             AND g.recorded_at::date = j.logged_at::date
           WHERE j.user_id = $1
             AND j.context ->> $2 IS NOT NULL
             AND (j.context ->> $2) ~ '^-?[0-9]+(\\.[0-9]+)?$'
             AND j.logged_at >= now() - ($3 * interval '1 day')
           GROUP BY j.logged_at::date
           ORDER BY date`,
          [user_id, key, days]
        );
        pairs = rows.map((r: any) => ({
          date: r.date,
          context_val: Number(Number(r.context_val).toFixed(2)),
          metric_val: Number(Number(r.metric_val).toFixed(1)),
        }));
      }

      const n = pairs.length;

      if (n < 3) {
        return {
          key,
          compare_to,
          window_days: days,
          sample_days: n,
          observation:
            n === 0
              ? `No days in the last ${days} days have a logged "${key}" value alongside ${compare_to} data.`
              : `Only ${n} day${n === 1 ? "" : "s"} in the last ${days} days have both "${key}" and ${compare_to} data — not enough to observe a pattern yet.`,
          pairs: [],
        };
      }

      // Median-split: compare average metric on higher-context days vs lower-context days
      const sorted = [...pairs].sort((a, b) => a.context_val - b.context_val);
      const mid = Math.floor(sorted.length / 2);
      const lower = sorted.slice(0, mid);
      const upper = sorted.slice(mid);

      const avgMetric = (arr: typeof pairs) =>
        arr.reduce((s, p) => s + p.metric_val, 0) / arr.length;

      const lowerAvg = avgMetric(lower);
      const upperAvg = avgMetric(upper);
      const metricLabel = compare_to === "mood" ? "mood score" : "glucose (mg/dL)";
      const diff = upperAvg - lowerAvg;

      let direction: string;
      if (Math.abs(diff) < (compare_to === "mood" ? 0.3 : 5)) {
        direction = `showed little difference (${lowerAvg.toFixed(1)} vs ${upperAvg.toFixed(1)} ${metricLabel})`;
      } else if (diff > 0) {
        direction = `averaged higher on days with higher "${key}" values (${upperAvg.toFixed(1)} vs ${lowerAvg.toFixed(1)} ${metricLabel})`;
      } else {
        direction = `averaged lower on days with higher "${key}" values (${upperAvg.toFixed(1)} vs ${lowerAvg.toFixed(1)} ${metricLabel})`;
      }

      const observation =
        `Over the ${n} days in the last ${days} days where you logged "${key}", ${metricLabel} ${direction}. ` +
        `This is an observation across ${n} day${n === 1 ? "" : "s"} of personal data — not a finding or a causal claim.`;

      return {
        key,
        compare_to,
        window_days: days,
        sample_days: n,
        observation,
        pairs,
      };
    }
  );

  app.get("/cross-metric", async (req) => {
    const user_id = req.user_id;

    const rows = await query<{
      d: string;
      did_exercise: boolean;
      sleep_secs: string | null;
      avg_glucose: string | null;
    }>(
      `WITH date_range AS (
         SELECT generate_series(
           (CURRENT_DATE - INTERVAL '60 days')::date,
           (CURRENT_DATE - INTERVAL '1 day')::date,
           INTERVAL '1 day'
         )::date AS d
       ),
       ex_days AS (
         SELECT DISTINCT logged_at::date AS d
         FROM exercise_log_entries
         WHERE user_id = $1
           AND logged_at >= NOW() - INTERVAL '60 days'
       ),
       sleep_by_day AS (
         SELECT
           start_time::date AS d,
           EXTRACT(EPOCH FROM (end_time - start_time)) AS sleep_secs
         FROM sleep_sessions
         WHERE user_id = $1
           AND start_time >= NOW() - INTERVAL '61 days'
       ),
       gluc_by_day AS (
         SELECT
           recorded_at::date AS d,
           AVG(mg_dl) AS avg_glucose
         FROM glucose_readings
         WHERE user_id = $1
           AND recorded_at >= NOW() - INTERVAL '60 days'
         GROUP BY recorded_at::date
       )
       SELECT
         dr.d,
         ex.d IS NOT NULL AS did_exercise,
         sl.sleep_secs,
         g.avg_glucose
       FROM date_range dr
       LEFT JOIN ex_days ex ON ex.d = dr.d
       LEFT JOIN sleep_by_day sl ON sl.d = dr.d
       LEFT JOIN gluc_by_day g ON g.d = dr.d
       WHERE g.avg_glucose IS NOT NULL`,
      [user_id]
    );

    const avg = (arr: typeof rows) =>
      arr.length
        ? Math.round(arr.reduce((s, r) => s + Number(r.avg_glucose), 0) / arr.length)
        : null;

    const withEx    = rows.filter(r => r.did_exercise);
    const noEx      = rows.filter(r => !r.did_exercise);
    const goodSleep = rows.filter(r => r.sleep_secs != null && Number(r.sleep_secs) >= 7 * 3600);
    const poorSleep = rows.filter(r => r.sleep_secs != null && Number(r.sleep_secs) > 0 && Number(r.sleep_secs) < 7 * 3600);

    return {
      exercise: {
        with_avg: avg(withEx),
        without_avg: avg(noEx),
        with_count: withEx.length,
        without_count: noEx.length,
      },
      sleep: {
        good_avg: avg(goodSleep),
        poor_avg: avg(poorSleep),
        good_count: goodSleep.length,
        poor_count: poorSleep.length,
      },
      total_days: rows.length,
    };
  });

  app.get("/journey", async (req) => {
    const user_id = req.user_id;

    const [meals, mood, active, user] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM meals WHERE user_id = $1`,
        [user_id]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM journal_entries WHERE user_id = $1`,
        [user_id]
      ),
      query<{ count: string }>(
        `SELECT COUNT(DISTINCT day)::text AS count FROM (
           SELECT logged_at::date AS day FROM meals WHERE user_id = $1
           UNION
           SELECT logged_at::date FROM journal_entries WHERE user_id = $1
           UNION
           SELECT ml.logged_at::date FROM metric_logs ml
             JOIN metrics m ON m.id = ml.metric_id WHERE m.user_id = $1
           UNION
           SELECT logged_at::date FROM spending_entries WHERE user_id = $1
         ) all_days`,
        [user_id]
      ),
      query<{ created_at: string }>(
        `SELECT created_at FROM users WHERE id = $1`,
        [user_id]
      ),
    ]);

    return {
      total_meals: parseInt(meals[0]?.count ?? "0", 10),
      total_mood_checkins: parseInt(mood[0]?.count ?? "0", 10),
      total_active_days: parseInt(active[0]?.count ?? "0", 10),
      member_since: user[0]?.created_at ?? null,
    };
  });
}
