import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getDailySummary, generateDailySummary } from "../services/dailySummaryService.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatSummaryResponse(row: any) {
  const dateStr = row.date instanceof Date
    ? row.date.toISOString().slice(0, 10)
    : String(row.date).slice(0, 10);
  return {
    date: dateStr,
    scores: {
      sleep: row.sleep_score,
      glucose: row.glucose_score,
      activity: row.activity_score,
      hydration: row.hydration_score,
      nutrition: row.nutrition_score,
      mood: row.mood_score,
      productivity: row.productivity_score,
      stress: row.stress_score,
      overall: row.overall_score,
    },
    summaryData: row.summary_data ?? {},
    insights: row.insights ?? [],
    generatedAt: row.updated_at ?? null,
  };
}

export default async function summaryRoutes(app: FastifyInstance) {
  app.get("/weekly-digest", async (req) => {
    const user_id = req.user_id;

    const [glucoseRows, highCarbRows, missingDayRows, spendingRows, hrRows, stepsRows, hobbiesRows] = await Promise.all([
      query<any>(`
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM recorded_at) >= 5 AND EXTRACT(HOUR FROM recorded_at) < 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM recorded_at) >= 11 AND EXTRACT(HOUR FROM recorded_at) < 16 THEN 'afternoon'
            WHEN EXTRACT(HOUR FROM recorded_at) >= 16 AND EXTRACT(HOUR FROM recorded_at) < 21 THEN 'evening'
            ELSE 'night'
          END AS bucket,
          ROUND(AVG(mg_dl)) AS avg_mg_dl,
          COUNT(*) AS reading_count
        FROM glucose_readings
        WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '7 days'
        GROUP BY bucket`, [user_id]),

      query<any>(`
        WITH avg_carbs AS (
          SELECT COALESCE(AVG(carbs_g), 60) AS val
          FROM meals WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '7 days' AND carbs_g IS NOT NULL
        )
        SELECT name, logged_at, meal_type,
               ROUND(carbs_g) AS carbs_g,
               ROUND((SELECT val FROM avg_carbs)) AS avg_carbs
        FROM meals, avg_carbs
        WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '7 days'
          AND carbs_g > GREATEST((SELECT val FROM avg_carbs) * 1.8, 60)
        ORDER BY carbs_g DESC LIMIT 3`, [user_id]),

      query<any>(`
        SELECT d::date AS day
        FROM generate_series(
          CURRENT_DATE - INTERVAL '6 days',
          CURRENT_DATE - INTERVAL '1 day',
          INTERVAL '1 day'
        ) AS d
        WHERE NOT EXISTS (
          SELECT 1 FROM meals WHERE user_id = $1 AND logged_at::date = d::date
        )`, [user_id]),

      query<any>(`
        WITH daily AS (
          SELECT logged_at::date AS day, SUM(amount) AS total
          FROM spending_entries
          WHERE user_id = $1 AND logged_at >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY logged_at::date
        )
        SELECT d.day, d.total,
          (SELECT AVG(total) FROM daily) AS avg_daily
        FROM daily d
        WHERE d.total > (SELECT AVG(total) FROM daily) * 2
        ORDER BY d.total DESC LIMIT 3`, [user_id]),

      query<any>(`
        SELECT ROUND(MIN(bpm)) AS resting, ROUND(MAX(bpm)) AS peak, COUNT(*) AS reading_count
        FROM heart_rate_readings
        WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '7 days'`, [user_id]),

      query<any>(`
        WITH m AS (SELECT id FROM metrics WHERE user_id = $1 AND name = 'steps')
        SELECT
          COALESCE((
            SELECT SUM(dmax) FROM (
              SELECT MAX(value) AS dmax FROM metric_logs
              WHERE metric_id = (SELECT id FROM m) AND logged_at::date >= CURRENT_DATE - 6
              GROUP BY logged_at::date
            ) t
          ), 0) AS this_week,
          COALESCE((
            SELECT SUM(dmax) FROM (
              SELECT MAX(value) AS dmax FROM metric_logs
              WHERE metric_id = (SELECT id FROM m)
                AND logged_at::date >= CURRENT_DATE - 13
                AND logged_at::date < CURRENT_DATE - 6
              GROUP BY logged_at::date
            ) t
          ), 0) AS last_week`, [user_id]),

      query<any>(`
        SELECT
          COUNT(CASE WHEN hl.logged_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS this_week_sessions,
          COUNT(CASE WHEN hl.logged_at >= NOW() - INTERVAL '14 days' AND hl.logged_at < NOW() - INTERVAL '7 days' THEN 1 END) AS last_week_sessions
        FROM hobby_logs hl
        JOIN hobbies h ON h.id = hl.hobby_id
        WHERE h.user_id = $1`, [user_id]),
    ]);

    const glucoseByTod: Record<string, { avg: number; count: number }> = {};
    for (const r of glucoseRows) {
      glucoseByTod[r.bucket] = { avg: Number(r.avg_mg_dl), count: Number(r.reading_count) };
    }

    const mealFlags: Array<{ label: string }> = [];
    for (const m of highCarbRows) {
      const d = new Date(m.logged_at);
      const dayName = DAY_NAMES[d.getDay()];
      const typeLabel = m.meal_type ? " " + m.meal_type : "";
      const avgLabel = m.avg_carbs ? `, avg ${m.avg_carbs}g` : "";
      mealFlags.push({ label: `${dayName}${typeLabel}: ${m.carbs_g}g carbs${avgLabel}` });
    }
    for (const r of missingDayRows) {
      const dayStr = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
      const d = new Date(dayStr + "T12:00:00");
      mealFlags.push({ label: `${DAY_NAMES[d.getDay()]}: no meals logged` });
    }

    const spendingSpikes = spendingRows.map((r: any) => {
      const dayStr = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
      const d = new Date(dayStr + "T12:00:00");
      const mult = Number(r.avg_daily) > 0 ? Math.round(Number(r.total) / Number(r.avg_daily)) : null;
      const multLabel = mult ? `, ${mult}x daily avg` : "";
      return { label: `${DAY_NAMES[d.getDay()]}: $${Number(r.total).toFixed(0)}${multLabel}` };
    });

    const hrCount = Number(hrRows[0]?.reading_count ?? 0);

    return {
      glucose_by_tod: glucoseByTod,
      meal_flags: mealFlags,
      spending_spikes: spendingSpikes,
      heart_rate: hrCount > 0
        ? { has_data: true, resting: Number(hrRows[0].resting), peak: Number(hrRows[0].peak) }
        : { has_data: false },
      steps: {
        this_week: Number(stepsRows[0]?.this_week ?? 0),
        last_week: Number(stepsRows[0]?.last_week ?? 0),
      },
      hobbies: {
        this_week_sessions: Number(hobbiesRows[0]?.this_week_sessions ?? 0),
        last_week_sessions: Number(hobbiesRows[0]?.last_week_sessions ?? 0),
      },
    };
  });

  // Powers the Overview tab's top stat row — reads from precomputed daily_summaries.
  app.get("/today", async (req) => {
    const user_id = req.user_id;
    const today = new Date().toISOString().slice(0, 10);
    const row = await getDailySummary(user_id, today);
    if (!row) return { user_id, date: today };
    return formatSummaryResponse(row);
  });

  // GET /summary/daily/:date — fetch or generate a specific day's summary.
  app.get("/daily/:date", async (req, reply) => {
    const user_id = req.user_id;
    const { date } = req.params as { date: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: "Invalid date format — expected YYYY-MM-DD" });
    }

    let row = await getDailySummary(user_id, date);
    if (!row) {
      row = await generateDailySummary(user_id, date);
    }
    if (!row) return { date, scores: null, summaryData: null, insights: [], generatedAt: null };
    return formatSummaryResponse(row);
  });

  // Today's pattern timeline with entry_type on mood events.
  app.get("/pattern", async (req) => {
    const user_id = req.user_id;
    const { date } = req.query as any;
    const day = date ?? new Date().toISOString().slice(0, 10);

    const [mood, spend, meals, glucoseSpikes, water, hobbyEvts] = await Promise.all([
      query(
        `SELECT logged_at AS time, 'mood' AS type,
                COALESCE(mood_label, mood_score::text) AS label,
                entry_type, period
         FROM journal_entries WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
      query(
        `SELECT logged_at AS time, 'spend' AS type, ('$' || amount || ' ' || COALESCE(category,'')) AS label
         FROM spending_entries WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
      query(
        `SELECT logged_at AS time, 'meal' AS type, name AS label
         FROM meals WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
      query(
        `SELECT recorded_at AS time, 'glucose_spike' AS type, (mg_dl || ' mg/dL') AS label
         FROM glucose_readings
         WHERE user_id = $1 AND recorded_at::date = $2 AND mg_dl > 180`,
        [user_id, day]
      ),
      query(
        `SELECT ml.logged_at AS time, 'water' AS type, 'Water' AS label
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'water' AND ml.logged_at::date = $2`,
        [user_id, day]
      ),
      query(
        `SELECT hl.logged_at AS time, 'hobby' AS type,
                CASE WHEN hl.amount > 0
                     THEN h.name || ': ' || ROUND(hl.amount::numeric) || ' ' || h.unit_label
                     ELSE h.name END AS label
         FROM hobby_logs hl
         JOIN hobbies h ON h.id = hl.hobby_id
         WHERE h.user_id = $1 AND hl.logged_at::date = $2`,
        [user_id, day]
      ),
    ]);

    const events = [...mood, ...spend, ...meals, ...glucoseSpikes, ...water, ...hobbyEvts].sort(
      (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    return events;
  });

  app.get("/streaks", async (req) => {
    const user_id = req.user_id;

    const mealDays = await query<any>(
      `SELECT DISTINCT logged_at::date AS day FROM meals
       WHERE user_id = $1 AND logged_at >= current_date - 90
       ORDER BY day DESC`,
      [user_id]
    );

    const days = mealDays.map((r: any) =>
      r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10)
    );

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let mealStreak = 0;
    if (days.length > 0 && (days[0] === today || days[0] === yesterday)) {
      let expected = days[0];
      for (const day of days) {
        if (day === expected) {
          mealStreak++;
          const d = new Date(expected + "T12:00:00");
          d.setDate(d.getDate() - 1);
          expected = d.toISOString().slice(0, 10);
        } else {
          break;
        }
      }
    }

    return { meal_streak: mealStreak };
  });

  // Combined day view: glucose readings + all events for the glucose overlay chart.
  app.get("/day", async (req) => {
    const user_id = req.user_id;
    const { date } = req.query as any;
    const day = date ?? new Date().toISOString().slice(0, 10);

    const [glucose, mood, meals, spend] = await Promise.all([
      query<any>(
        `SELECT recorded_at, mg_dl::float FROM glucose_readings
         WHERE user_id = $1 AND recorded_at::date = $2 ORDER BY recorded_at`,
        [user_id, day]
      ),
      query<any>(
        `SELECT logged_at AS time, 'mood' AS type, entry_type, period,
                COALESCE(mood_label, mood_score::text) AS label, mood_score
         FROM journal_entries WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
      query<any>(
        `SELECT logged_at AS time, 'meal' AS type, name AS label,
                carbs_g::float AS carbs_g
         FROM meals WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
      query<any>(
        `SELECT logged_at AS time, 'spend' AS type,
                ('$' || amount::int || COALESCE(' ' || category, '')) AS label
         FROM spending_entries WHERE user_id = $1 AND logged_at::date = $2`,
        [user_id, day]
      ),
    ]);

    const events = [...mood, ...meals, ...spend].sort(
      (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    return { glucose, events };
  });
}
