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
  app.get<{ Querystring: { user_id: string; key: string; compare_to: string; days?: string } }>(
    "/context-correlation",
    async (req) => {
      const { user_id, key, compare_to } = req.query;
      const days = Math.min(Math.max(parseInt(req.query.days ?? "30", 10) || 30, 7), 90);

      if (!user_id || !key || !compare_to) {
        return { error: "user_id, key, and compare_to are required" };
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
}
