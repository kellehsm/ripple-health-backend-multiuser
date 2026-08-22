import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { parseWeekStartDay } from "../lib/weekStartDay.js";

export default async function heartRateRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const { start, end } = req.query as any;
    if (start && end) {
      return query(
        `SELECT recorded_at, bpm FROM heart_rate_readings
         WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3
         ORDER BY recorded_at LIMIT 20000`,
        [user_id, start, end]
      );
    }
    return query(
      `SELECT recorded_at, bpm FROM heart_rate_readings
       WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 288`,
      [user_id]
    );
  });

  // GET /api/heart-rate/stats
  // Returns resting HR trend (30d daily 5th-pct), this-week vs last-week avg,
  // today's zone breakdown (uses birthdate for max HR if available),
  // and today's min/max with timestamps. Respects user's week_start setting.
  app.get("/stats", async (req) => {
    const user_id = req.user_id;

    // Fetch user week_start + birthdate from user_settings
    const [settingsRow] = await query<any>(
      "SELECT settings FROM user_settings WHERE user_id = $1",
      [user_id]
    );
    const rawWeekStart = settingsRow?.settings?.week_start;
    const weekStartDay = parseWeekStartDay(
      rawWeekStart !== undefined && rawWeekStart !== null ? String(rawWeekStart) : "1"
    );
    const birthdate: string | undefined = settingsRow?.settings?.profile?.birthdate;
    const age = birthdate
      ? Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 3600 * 1000))
      : null;
    const maxHR = age != null ? 220 - age : null;

    // 30-day daily resting (5th percentile) + avg per day
    const trend30 = await query<any>(
      `SELECT
         recorded_at::date AS date,
         PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY bpm)::int AS resting_bpm,
         ROUND(AVG(bpm))::int AS avg_bpm,
         COUNT(*)::int AS reading_count
       FROM heart_rate_readings
       WHERE user_id = $1 AND recorded_at >= current_date - interval '29 days'
       GROUP BY recorded_at::date
       ORDER BY recorded_at::date ASC`,
      [user_id]
    );

    // Week start date
    const [weekStartRow] = await query<any>(
      `SELECT (date_trunc('day', now()) - ((EXTRACT(DOW FROM now())::int - $1 + 7) % 7) * INTERVAL '1 day')::date AS ws`,
      [weekStartDay]
    );
    const weekStart: string = weekStartRow.ws;

    // This-week resting avg
    const [thisWeekRow] = await query<any>(
      `SELECT ROUND(AVG(day_rest))::int AS avg_rest FROM (
         SELECT recorded_at::date AS d,
                PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY bpm) AS day_rest
         FROM heart_rate_readings
         WHERE user_id = $1 AND recorded_at::date >= $2::date
         GROUP BY recorded_at::date
       ) sub`,
      [user_id, weekStart]
    );
    // Last-week resting avg (7 days before week_start)
    const [lastWeekRow] = await query<any>(
      `SELECT ROUND(AVG(day_rest))::int AS avg_rest FROM (
         SELECT recorded_at::date AS d,
                PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY bpm) AS day_rest
         FROM heart_rate_readings
         WHERE user_id = $1
           AND recorded_at::date >= $2::date - interval '7 days'
           AND recorded_at::date < $2::date
         GROUP BY recorded_at::date
       ) sub`,
      [user_id, weekStart]
    );

    // Today's min (with time) and max (with time)
    const [todayMinRow] = await query<any>(
      `SELECT bpm, recorded_at FROM heart_rate_readings
       WHERE user_id = $1 AND recorded_at::date = current_date
       ORDER BY bpm ASC LIMIT 1`,
      [user_id]
    );
    const [todayMaxRow] = await query<any>(
      `SELECT bpm, recorded_at FROM heart_rate_readings
       WHERE user_id = $1 AND recorded_at::date = current_date
       ORDER BY bpm DESC LIMIT 1`,
      [user_id]
    );

    // Today's zone breakdown (only if maxHR known or use 190 est)
    const effectiveMax = maxHR ?? 190;
    const zone1Max = Math.round(effectiveMax * 0.60); // rest < 60%
    const zone2Max = Math.round(effectiveMax * 0.70); // light 60-70%
    const zone3Max = Math.round(effectiveMax * 0.80); // moderate 70-80%
    // hard > 80%
    const [zonesRow] = await query<any>(
      `SELECT
         COUNT(*) FILTER (WHERE bpm < $2)::int AS zone_rest_count,
         COUNT(*) FILTER (WHERE bpm >= $2 AND bpm < $3)::int AS zone_light_count,
         COUNT(*) FILTER (WHERE bpm >= $3 AND bpm < $4)::int AS zone_moderate_count,
         COUNT(*) FILTER (WHERE bpm >= $4)::int AS zone_hard_count,
         COUNT(*)::int AS total_count
       FROM heart_rate_readings
       WHERE user_id = $1 AND recorded_at::date = current_date`,
      [user_id, zone1Max, zone2Max, zone3Max]
    );

    return {
      trend_30d: trend30,
      this_week_avg_rest: thisWeekRow?.avg_rest ?? null,
      last_week_avg_rest: lastWeekRow?.avg_rest ?? null,
      week_start: weekStart,
      today_min: todayMinRow ? { bpm: todayMinRow.bpm, recorded_at: todayMinRow.recorded_at } : null,
      today_max: todayMaxRow ? { bpm: todayMaxRow.bpm, recorded_at: todayMaxRow.recorded_at } : null,
      zones: {
        max_hr: effectiveMax,
        max_hr_estimated: maxHR == null,
        zone1_max: zone1Max,
        zone2_max: zone2Max,
        zone3_max: zone3Max,
        rest: zonesRow?.zone_rest_count ?? 0,
        light: zonesRow?.zone_light_count ?? 0,
        moderate: zonesRow?.zone_moderate_count ?? 0,
        hard: zonesRow?.zone_hard_count ?? 0,
        total: zonesRow?.total_count ?? 0,
      },
    };
  });

  app.get("/daily", async (req) => {
    const user_id = req.user_id;
    const { days = "7" } = req.query as any;
    const n = Math.min(Math.max(parseInt(days, 10) || 7, 1), 30);
    return query<any>(
      `SELECT date, resting_bpm, peak_bpm, avg_bpm, reading_count FROM (
         SELECT
           date_trunc('day', recorded_at)::date AS date,
           PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY bpm)::int AS resting_bpm,
           MAX(bpm)::int   AS peak_bpm,
           ROUND(AVG(bpm))::int AS avg_bpm,
           COUNT(*)::int   AS reading_count
         FROM heart_rate_readings
         WHERE user_id = $1
         GROUP BY 1
         ORDER BY 1 DESC
         LIMIT $2
       ) sub
       ORDER BY date DESC`,
      [user_id, n]
    );
  });
}
