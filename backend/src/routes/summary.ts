import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getDailySummary, generateDailySummary } from "../services/dailySummaryService.js";
import { estToday, estYesterday, estDayOfWeek, estDayOfWeekForDayStr } from "../lib/estDate.js";
import { getUserTz } from "../lib/userTz.js";
import { getOrGenerateNarrative } from "../services/monthlyNarrative.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── 1-hour in-process TTL cache for heavy aggregate endpoints ────────────────
// Key format: "userId:YYYY-MM-DD". Mirrors the pattern used in lib/userTz.ts.
const SUMMARY_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const streaksCache = new Map<string, { data: unknown; expiresAt: number }>();
const weeklyDigestCache = new Map<string, { data: unknown; expiresAt: number }>();

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
  app.get("/wellness-history", async (req) => {
    const user_id = req.user_id;
    const days = Math.min(Math.max(Number((req.query as any).days ?? 7), 1), 90);
    const rows = await query<{ date: string; overall_score: number | null }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, overall_score
       FROM daily_summaries
       WHERE user_id = $1 AND date >= CURRENT_DATE - ($2 - 1) * INTERVAL '1 day'
       ORDER BY date ASC`,
      [user_id, days]
    );
    return { history: rows };
  });

  app.get("/weekly-digest", async (req) => {
    const user_id = req.user_id;
    const tz = await getUserTz(user_id);
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const digestCacheKey = `${user_id}:${todayKey}`;
    const digestHit = weeklyDigestCache.get(digestCacheKey);
    if (digestHit && digestHit.expiresAt > Date.now()) return digestHit.data;

    const [glucoseRows, highCarbRows, missingDayRows, spendingRows, hrRows, stepsRows, hobbiesRows, exerciseRows, booksRows, moodRows] = await Promise.all([
      query<any>(`
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM recorded_at AT TIME ZONE $2) >= 5 AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE $2) < 11 THEN 'morning'
            WHEN EXTRACT(HOUR FROM recorded_at AT TIME ZONE $2) >= 11 AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE $2) < 16 THEN 'afternoon'
            WHEN EXTRACT(HOUR FROM recorded_at AT TIME ZONE $2) >= 16 AND EXTRACT(HOUR FROM recorded_at AT TIME ZONE $2) < 21 THEN 'evening'
            ELSE 'night'
          END AS bucket,
          ROUND(AVG(mg_dl)) AS avg_mg_dl,
          COUNT(*) AS reading_count
        FROM glucose_readings
        WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '7 days'
        GROUP BY bucket`, [user_id, tz]),

      query<any>(`
        WITH avg_carbs AS (
          SELECT COALESCE(AVG(carbs_g * servings), 60) AS val
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
        ),
        avg_daily AS (SELECT COALESCE(AVG(total), 0) AS val FROM daily)
        SELECT d.day, d.total, a.val AS avg_daily
        FROM daily d, avg_daily a
        WHERE d.total > a.val * 2
        ORDER BY d.total DESC LIMIT 3`, [user_id]),

      query<any>(`
        SELECT ROUND(MIN(bpm)) AS resting, ROUND(MAX(bpm)) AS peak, COUNT(*) AS reading_count
        FROM heart_rate_readings
        WHERE user_id = $1 AND recorded_at >= NOW() - INTERVAL '7 days'`, [user_id]),

      query<any>(`
        SELECT
          COALESCE(SUM(CASE WHEN logged_at >= CURRENT_DATE - interval '6 days' THEN max_val ELSE 0 END), 0) AS this_week,
          COALESCE(SUM(CASE WHEN logged_at < CURRENT_DATE - interval '6 days' THEN max_val ELSE 0 END), 0) AS last_week
        FROM (
          SELECT logged_at::date, MAX(value) AS max_val
          FROM metric_logs
          WHERE metric_id = (SELECT id FROM metrics WHERE user_id = $1 AND name = 'steps' ORDER BY id LIMIT 1)
            AND logged_at >= CURRENT_DATE - interval '13 days'
          GROUP BY logged_at::date
        ) daily`, [user_id]),

      query<any>(`
        SELECT
          COUNT(CASE WHEN hl.logged_at >= NOW() - INTERVAL '7 days' THEN 1 END) AS this_week_sessions,
          COUNT(CASE WHEN hl.logged_at >= NOW() - INTERVAL '14 days' AND hl.logged_at < NOW() - INTERVAL '7 days' THEN 1 END) AS last_week_sessions
        FROM hobby_logs hl
        JOIN hobbies h ON h.id = hl.hobby_id
        WHERE h.user_id = $1`, [user_id]),

      query<any>(`
        SELECT
          COUNT(*) FILTER (WHERE ended_at IS NOT NULL) AS sessions_this_week,
          COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0) FILTER (WHERE ended_at IS NOT NULL), 0) AS total_minutes
        FROM exercise_sessions
        WHERE user_id = $1 AND started_at >= NOW() - INTERVAL '7 days'`, [user_id]),

      query<any>(`
        SELECT COUNT(*) AS finished_this_month
        FROM books
        WHERE user_id = $1 AND status = 'finished'
          AND finished_at >= date_trunc('month', CURRENT_DATE)`, [user_id]),

      query<any>(`
        SELECT ROUND(AVG(mood_score), 1) AS avg_mood
        FROM journal_entries
        WHERE user_id = $1 AND logged_at >= NOW() - INTERVAL '7 days'
          AND entry_type != 'moment'`, [user_id]),
    ]);

    const glucoseByTod: Record<string, { avg: number; count: number }> = {};
    for (const r of glucoseRows) {
      glucoseByTod[r.bucket] = { avg: Number(r.avg_mg_dl), count: Number(r.reading_count) };
    }

    const mealFlags: Array<{ label: string }> = [];
    for (const m of highCarbRows) {
      const dayName = DAY_NAMES[estDayOfWeek(m.logged_at)];
      const typeLabel = m.meal_type ? " " + m.meal_type : "";
      const avgLabel = m.avg_carbs ? `, avg ${m.avg_carbs}g` : "";
      mealFlags.push({ label: `${dayName}${typeLabel}: ${m.carbs_g}g carbs${avgLabel}` });
    }
    for (const r of missingDayRows) {
      const dayStr = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
      mealFlags.push({ label: `${DAY_NAMES[estDayOfWeekForDayStr(dayStr)]}: no meals logged` });
    }

    const spendingSpikes = spendingRows.map((r: any) => {
      const dayStr = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
      const mult = Number(r.avg_daily) > 0 ? Math.round(Number(r.total) / Number(r.avg_daily)) : null;
      const multLabel = mult ? `, ${mult}x daily avg` : "";
      return { label: `${DAY_NAMES[estDayOfWeekForDayStr(dayStr)]}: $${Number(r.total).toFixed(0)}${multLabel}` };
    });

    const hrCount = Number(hrRows[0]?.reading_count ?? 0);

    const digestResult = {
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
      exercise: {
        sessions_this_week: Number(exerciseRows[0]?.sessions_this_week ?? 0),
        total_minutes_this_week: Math.round(Number(exerciseRows[0]?.total_minutes ?? 0)),
      },
      books: {
        finished_this_month: Number(booksRows[0]?.finished_this_month ?? 0),
      },
      mood: {
        avg_this_week: moodRows[0]?.avg_mood != null ? Number(moodRows[0].avg_mood) : null,
      },
    };
    weeklyDigestCache.set(digestCacheKey, { data: digestResult, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS });
    return digestResult;
  });

  // GET /summary/what-changed — this week vs last week deltas on the key
  // metrics. Powers the "What changed" card on Overview so users see the
  // biggest movers at a glance without doing chart math themselves.
  app.get("/what-changed", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>(
      `WITH weeks AS (
         SELECT
           SUM(CASE WHEN date >= date_trunc('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS this_days,
           SUM(CASE WHEN date >= date_trunc('week', CURRENT_DATE - INTERVAL '7 days')
                     AND date <  date_trunc('week', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS last_days,
           AVG(CASE WHEN date >= date_trunc('week', CURRENT_DATE) THEN steps          END)::float AS this_steps,
           AVG(CASE WHEN date >= date_trunc('week', CURRENT_DATE - INTERVAL '7 days')
                     AND date <  date_trunc('week', CURRENT_DATE) THEN steps          END)::float AS last_steps,
           AVG(CASE WHEN date >= date_trunc('week', CURRENT_DATE) THEN sleep_hours    END)::float AS this_sleep,
           AVG(CASE WHEN date >= date_trunc('week', CURRENT_DATE - INTERVAL '7 days')
                     AND date <  date_trunc('week', CURRENT_DATE) THEN sleep_hours    END)::float AS last_sleep,
           AVG(CASE WHEN date >= date_trunc('week', CURRENT_DATE) THEN avg_glucose    END)::float AS this_glu,
           AVG(CASE WHEN date >= date_trunc('week', CURRENT_DATE - INTERVAL '7 days')
                     AND date <  date_trunc('week', CURRENT_DATE) THEN avg_glucose    END)::float AS last_glu,
           AVG(CASE WHEN date >= date_trunc('week', CURRENT_DATE) THEN overall_score  END)::float AS this_score,
           AVG(CASE WHEN date >= date_trunc('week', CURRENT_DATE - INTERVAL '7 days')
                     AND date <  date_trunc('week', CURRENT_DATE) THEN overall_score  END)::float AS last_score
         FROM daily_summaries
         WHERE user_id = $1 AND date >= date_trunc('week', CURRENT_DATE - INTERVAL '7 days')
       )
       SELECT * FROM weeks`,
      [user_id]
    );
    const r = rows[0] ?? {};
    function delta(now: number | null, prev: number | null) {
      if (now == null || prev == null || prev === 0) return null;
      return Math.round(((now - prev) / prev) * 100);
    }
    return {
      this_days_logged: r.this_days ?? 0,
      last_days_logged: r.last_days ?? 0,
      steps:   { this: r.this_steps,  last: r.last_steps,  pct: delta(r.this_steps,  r.last_steps) },
      sleep:   { this: r.this_sleep,  last: r.last_sleep,  pct: delta(r.this_sleep,  r.last_sleep) },
      glucose: { this: r.this_glu,    last: r.last_glu,    pct: delta(r.this_glu,    r.last_glu) },
      score:   { this: r.this_score,  last: r.last_score,  pct: delta(r.this_score,  r.last_score) },
    };
  });

  // Powers the Overview tab's top stat row — reads from precomputed daily_summaries.
  app.get("/today", async (req) => {
    const user_id = req.user_id;
    const today = estToday();
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
    const day = date ?? estToday();
    const tz = await getUserTz(user_id);

    const [mood, spend, meals, glucoseSpikes, water, hobbyEvts] = await Promise.all([
      query(
        `SELECT logged_at AS time, 'mood' AS type,
                COALESCE(mood_label, mood_score::text) AS label,
                entry_type, period
         FROM journal_entries WHERE user_id = $1 AND (logged_at AT TIME ZONE $3)::date = $2`,
        [user_id, day, tz]
      ),
      query(
        `SELECT logged_at AS time, 'spend' AS type, ('$' || amount || ' ' || COALESCE(category,'')) AS label
         FROM spending_entries WHERE user_id = $1 AND (logged_at AT TIME ZONE $3)::date = $2`,
        [user_id, day, tz]
      ),
      query(
        `SELECT logged_at AS time, 'meal' AS type, name AS label
         FROM meals WHERE user_id = $1 AND (logged_at AT TIME ZONE $3)::date = $2`,
        [user_id, day, tz]
      ),
      query(
        `SELECT recorded_at AS time, 'glucose_spike' AS type, (mg_dl || ' mg/dL') AS label
         FROM glucose_readings
         WHERE user_id = $1 AND (recorded_at AT TIME ZONE $3)::date = $2 AND mg_dl > 180`,
        [user_id, day, tz]
      ),
      query(
        `SELECT ml.logged_at AS time, 'water' AS type, 'Water' AS label
         FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'water' AND (ml.logged_at AT TIME ZONE $3)::date = $2`,
        [user_id, day, tz]
      ),
      query(
        `SELECT hl.logged_at AS time, 'hobby' AS type,
                CASE WHEN hl.amount > 0
                     THEN h.name || ': ' || ROUND(hl.amount::numeric) || ' ' || h.unit_label
                     ELSE h.name END AS label
         FROM hobby_logs hl
         JOIN hobbies h ON h.id = hl.hobby_id
         WHERE h.user_id = $1 AND (hl.logged_at AT TIME ZONE $3)::date = $2`,
        [user_id, day, tz]
      ),
    ]);

    const events = [...mood, ...spend, ...meals, ...glucoseSpikes, ...water, ...hobbyEvts].sort(
      (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    return events;
  });

  // GET /streaks/freeze-status — returns which streak types have used their freeze this month
  app.get("/streaks/freeze-status", async (req) => {
    const user_id = req.user_id;
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    const freezeMonth = firstOfMonth.toISOString().slice(0, 10);

    const rows = await query<any>(
      `SELECT streak_type FROM streak_freezes
       WHERE user_id = $1 AND freeze_month = $2`,
      [user_id, freezeMonth]
    );
    const usedThisMonth = rows.map((r: any) => r.streak_type);
    return { canFreeze: true, usedThisMonth };
  });

  // POST /streaks/freeze — apply a streak freeze for a missed day
  app.post("/streaks/freeze", async (req, reply) => {
    const user_id = req.user_id;
    const { streak_type, missed_date } = req.body as any;

    if (!streak_type || !missed_date) {
      return reply.status(400).send({ error: "streak_type and missed_date are required" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(missed_date)) {
      return reply.status(400).send({ error: "missed_date must be YYYY-MM-DD" });
    }

    // Only allow yesterday or the day before yesterday
    const tz = await getUserTz(user_id);
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    const yesterday = fmt.format(new Date(Date.now() - 86400000));
    const dayBefore = fmt.format(new Date(Date.now() - 2 * 86400000));
    if (missed_date !== yesterday && missed_date !== dayBefore) {
      return reply.status(400).send({ error: "missed_date must be yesterday or the day before" });
    }

    // freeze_month = first day of missed_date's month
    const [year, month] = missed_date.split("-");
    const freezeMonth = `${year}-${month}-01`;

    try {
      await query(
        `INSERT INTO streak_freezes (user_id, freeze_month, applied_to_date, streak_type)
         VALUES ($1, $2, $3, $4)`,
        [user_id, freezeMonth, missed_date, streak_type]
      );
      // Invalidate streak cache so next /streaks call reflects the freeze
      const todayKey = fmt.format(new Date());
      streaksCache.delete(`${user_id}:${todayKey}`);
      return { ok: true, freeze_month: freezeMonth, applied_to_date: missed_date, streak_type };
    } catch (err: any) {
      if (err.code === "23505") {
        return reply.status(400).send({ error: `Freeze already used this month for streak type: ${streak_type}` });
      }
      throw err;
    }
  });

  app.get("/streaks", async (req) => {
    const user_id = req.user_id;
    const tz = await getUserTz(user_id);
    // "Today"/"yesterday" in the user's local zone, matching the AT TIME ZONE
    // day-bucketing below.
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    const today = fmt.format(new Date());
    const yesterday = fmt.format(new Date(Date.now() - 86400000));

    const streaksCacheKey = `${user_id}:${today}`;
    const streaksHit = streaksCache.get(streaksCacheKey);
    if (streaksHit && streaksHit.expiresAt > Date.now()) return streaksHit.data;

    function calcStreak(rawDays: any[], frozenDates: Set<string>): number {
      const days = rawDays.map((r: any) =>
        r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10)
      );
      if (days.length === 0 || (days[0] !== today && days[0] !== yesterday)) return 0;
      let streak = 0;
      let expected = days[0];
      const daySet = new Set(days);
      for (;;) {
        if (daySet.has(expected)) {
          streak++;
        } else if (frozenDates.has(expected)) {
          // Gap covered by a freeze — count it and continue walking back
          streak++;
        } else {
          break;
        }
        const d = new Date(expected + "T12:00:00");
        d.setDate(d.getDate() - 1);
        expected = d.toISOString().slice(0, 10);
      }
      return streak;
    }

    const [mealDays, moodDays, stepsDays, exerciseDays, readingDays, waterDays, hobbyDays, freezeRows] = await Promise.all([
      query<any>(
        `SELECT DISTINCT (logged_at AT TIME ZONE $2)::date AS day FROM meals
         WHERE user_id = $1 AND logged_at >= current_date - 90
         ORDER BY day DESC`,
        [user_id, tz]
      ),
      query<any>(
        `SELECT DISTINCT (logged_at AT TIME ZONE $2)::date AS day FROM journal_entries
         WHERE user_id = $1 AND logged_at >= current_date - 90
         ORDER BY day DESC`,
        [user_id, tz]
      ),
      query<any>(
        `SELECT DISTINCT (ml.logged_at AT TIME ZONE $2)::date AS day
         FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'steps' AND ml.value > 0
           AND ml.logged_at >= current_date - 90
         ORDER BY day DESC`,
        [user_id, tz]
      ),
      query<any>(
        `SELECT DISTINCT (started_at AT TIME ZONE $2)::date AS day FROM exercise_sessions
         WHERE user_id = $1 AND ended_at IS NOT NULL
           AND started_at >= current_date - 90
         ORDER BY day DESC`,
        [user_id, tz]
      ),
      query<any>(
        `SELECT DISTINCT logged_at AS day FROM reading_logs
         WHERE user_id = $1 AND logged_at >= current_date - 90
         ORDER BY day DESC`,
        [user_id]
      ),
      // Water streak: days where the user hit at least 6 water log events.
      // Threshold matches the target the app nudges toward on Home.
      query<any>(
        `SELECT day FROM (
           SELECT (ml.logged_at AT TIME ZONE $2)::date AS day, COUNT(*) AS n
           FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
           WHERE m.user_id = $1 AND m.name = 'water'
             AND ml.logged_at >= current_date - 90
           GROUP BY (ml.logged_at AT TIME ZONE $2)::date
         ) w
         WHERE n >= 6
         ORDER BY day DESC`,
        [user_id, tz]
      ),
      // Hobby streak: any hobby session on a given day counts.
      query<any>(
        `SELECT DISTINCT (hl.logged_at AT TIME ZONE $2)::date AS day
         FROM hobby_logs hl JOIN hobbies h ON h.id = hl.hobby_id
         WHERE h.user_id = $1 AND hl.logged_at >= current_date - 90
         ORDER BY day DESC`,
        [user_id, tz]
      ),
      // Streak freezes applied in the last 90 days, grouped by streak_type
      query<any>(
        `SELECT streak_type, applied_to_date::text AS applied_to_date
         FROM streak_freezes
         WHERE user_id = $1 AND applied_to_date >= current_date - 90`,
        [user_id]
      ),
    ]);

    // Build per-type freeze sets for streak calculation
    function freezeSet(type: string): Set<string> {
      return new Set(
        freezeRows
          .filter((r: any) => r.streak_type === type)
          .map((r: any) => String(r.applied_to_date).slice(0, 10))
      );
    }

    const streaksResult = {
      meal_streak:     calcStreak(mealDays,     freezeSet("logging")),
      mood_streak:     calcStreak(moodDays,     freezeSet("mood")),
      steps_streak:    calcStreak(stepsDays,    freezeSet("steps")),
      exercise_streak: calcStreak(exerciseDays, freezeSet("exercise")),
      reading_streak:  calcStreak(readingDays,  freezeSet("reading")),
      water_streak:    calcStreak(waterDays,    freezeSet("water")),
      hobby_streak:    calcStreak(hobbyDays,    freezeSet("hobby")),
    };
    streaksCache.set(streaksCacheKey, { data: streaksResult, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS });
    return streaksResult;
  });

  // Descriptive-only pattern observations for the Home tab. Returns up to two
  // "something to notice" lines built from N-of-last-M counts across last 14
  // days. Never causal, never diagnostic — CLAUDE.md correlation rules.
  // Requires at least 5 qualifying days to speak up, so single-day noise
  // doesn't produce false patterns.
  app.get("/why-might-that-be", async (req) => {
    const user_id = req.user_id;

    // 14 daily buckets: morning glucose avg, prev-evening-late-meal flag,
    // sleep hours (night ending that morning), steps.
    const [dailyRows] = await Promise.all([
      query<any>(
        `WITH days AS (
           SELECT (current_date - g)::date AS d
           FROM generate_series(0, 13) g
         ),
         morn_gluc AS (
           SELECT (recorded_at AT TIME ZONE 'America/New_York')::date AS d,
                  AVG(mg_dl)::float AS avg_mg
           FROM glucose_readings
           WHERE user_id = $1
             AND recorded_at >= current_date - 14
             AND EXTRACT(HOUR FROM (recorded_at AT TIME ZONE 'America/New_York')) BETWEEN 5 AND 10
           GROUP BY 1
         ),
         late_meals AS (
           SELECT ((logged_at AT TIME ZONE 'America/New_York')::date + INTERVAL '1 day')::date AS d
           FROM meals
           WHERE user_id = $1
             AND logged_at >= current_date - 15
             AND EXTRACT(HOUR FROM (logged_at AT TIME ZONE 'America/New_York')) >= 20
           GROUP BY 1
         ),
         sleep_by_day AS (
           SELECT (end_time AT TIME ZONE 'America/New_York')::date AS d,
                  SUM(EXTRACT(EPOCH FROM (end_time - start_time)))/3600.0 AS hrs
           FROM sleep_sessions
           WHERE user_id = $1 AND end_time >= current_date - 14
           GROUP BY 1
         ),
         steps_by_day AS (
           SELECT (ml.logged_at AT TIME ZONE 'America/New_York')::date AS d,
                  SUM(ml.value)::float AS steps
           FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
           WHERE m.user_id = $1 AND m.name = 'steps' AND ml.logged_at >= current_date - 14
           GROUP BY 1
         )
         SELECT days.d,
                mg.avg_mg,
                (lm.d IS NOT NULL) AS late_meal_prev,
                sb.hrs AS sleep_hrs,
                st.steps
         FROM days
         LEFT JOIN morn_gluc  mg ON mg.d = days.d
         LEFT JOIN late_meals lm ON lm.d = days.d
         LEFT JOIN sleep_by_day sb ON sb.d = days.d
         LEFT JOIN steps_by_day st ON st.d = days.d
         ORDER BY days.d DESC`,
        [user_id]
      ),
    ]);

    const notices: { text: string }[] = [];

    // Pattern A — high morning glucose × late dinner the night before.
    const highGlucDays = dailyRows.filter((r: any) => r.avg_mg != null && r.avg_mg > 130);
    const highWithLate = highGlucDays.filter((r: any) => r.late_meal_prev);
    if (highGlucDays.length >= 5 && highWithLate.length >= 3) {
      notices.push({
        text: `Something to notice: ${highWithLate.length} of the last ${highGlucDays.length} higher-glucose mornings followed a dinner logged after 8pm.`,
      });
    }

    // Pattern B — short sleep × lower-step days.
    const stepsVals = dailyRows.map((r: any) => Number(r.steps)).filter((n: number) => n > 0);
    if (stepsVals.length >= 5) {
      const avgSteps = stepsVals.reduce((a: number, b: number) => a + b, 0) / stepsVals.length;
      const shortSleepDays = dailyRows.filter((r: any) => r.sleep_hrs != null && r.sleep_hrs < 6);
      const shortAndLow = shortSleepDays.filter((r: any) => r.steps != null && Number(r.steps) < avgSteps * 0.7);
      if (shortSleepDays.length >= 5 && shortAndLow.length >= 3) {
        notices.push({
          text: `Something to notice: ${shortAndLow.length} of the last ${shortSleepDays.length} shorter-sleep nights (under 6h) were followed by lower-step days.`,
        });
      }
    }

    return { notices: notices.slice(0, 2) };
  });

  // GET /summary/monthly-review — previous calendar month summary for the
  // "Monthly review" card shown on Overview during the first 7 days of a month.
  app.get("/monthly-review", async (req) => {
    const user_id = req.user_id;
    const tz = await getUserTz(user_id);

    // Compute previous month boundaries in user's timezone
    const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const year = nowInTz.getFullYear();
    const month = nowInTz.getMonth(); // 0-indexed current month
    // Previous month: month-1 (handles Jan → Dec prev year)
    const prevMonthDate = new Date(year, month - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth() + 1; // 1-indexed
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
    const monthStart = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
    // Last day of previous month = first day of current month minus 1
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Two months ago for spending comparison
    const twoMonthsAgoDate = new Date(year, month - 2, 1);
    const twoYear = twoMonthsAgoDate.getFullYear();
    const twoMonth = twoMonthsAgoDate.getMonth() + 1;
    const twoMonthStart = `${twoYear}-${String(twoMonth).padStart(2, "0")}-01`;
    const twoMonthLastDay = new Date(prevYear, prevMonth - 1, 0).getDate();
    const twoMonthEnd = `${twoYear}-${String(twoMonth).padStart(2, "0")}-${String(twoMonthLastDay).padStart(2, "0")}`;

    try {
      const scoreAvgSql = `SELECT
           ROUND(AVG(overall_score))::int AS overall,
           ROUND(AVG(sleep_score))::int AS sleep,
           ROUND(AVG(glucose_score))::int AS glucose,
           ROUND(AVG(activity_score))::int AS activity,
           ROUND(AVG(hydration_score))::int AS hydration,
           ROUND(AVG(nutrition_score))::int AS nutrition,
           ROUND(AVG(mood_score))::int AS mood,
           ROUND(AVG(productivity_score))::int AS productivity,
           ROUND(AVG(stress_score))::int AS stress
         FROM daily_summaries
         WHERE user_id = $1 AND date >= $2 AND date <= $3`;

      const [stepsRows, spendRows, prevSpendRows, mealDaysRows, scoreRows, prevScoreRows, bestDayRows, totalStepsRows] = await Promise.all([
        // Steps by ISO week within the previous month.
        // MAX per day then SUM — steps sync cumulatively, so raw SUM double-counts
        // (matches weekly-digest / weekly-total).
        query<any>(
          `SELECT
             date_trunc('week', day) AS week_start,
             SUM(day_max)::float AS total_steps
           FROM (
             SELECT ml.logged_at::date AS day, MAX(ml.value) AS day_max
             FROM metric_logs ml
             JOIN metrics m ON m.id = ml.metric_id
             WHERE m.user_id = $1 AND m.name = 'steps'
               AND ml.logged_at >= $2::date AND ml.logged_at < $3::date + interval '1 day'
               AND ml.value > 0
             GROUP BY ml.logged_at::date
           ) daily
           GROUP BY week_start
           ORDER BY total_steps DESC`,
          [user_id, monthStart, monthEnd]
        ),
        query<any>(
          `SELECT COALESCE(SUM(amount), 0)::float AS total
           FROM spending_entries
           WHERE user_id = $1 AND logged_at >= $2::date AND logged_at < $3::date + interval '1 day'`,
          [user_id, monthStart, monthEnd]
        ),
        query<any>(
          `SELECT COALESCE(SUM(amount), 0)::float AS total
           FROM spending_entries
           WHERE user_id = $1 AND logged_at >= $2::date AND logged_at < $3::date + interval '1 day'`,
          [user_id, twoMonthStart, twoMonthEnd]
        ),
        // Count distinct days with meal logs for the observation
        query<any>(
          `SELECT COUNT(DISTINCT logged_at::date)::int AS days_logged
           FROM meals
           WHERE user_id = $1 AND logged_at >= $2::date AND logged_at < $3::date + interval '1 day'`,
          [user_id, monthStart, monthEnd]
        ),
        query<any>(scoreAvgSql, [user_id, monthStart, monthEnd]),
        query<any>(scoreAvgSql, [user_id, twoMonthStart, twoMonthEnd]),
        query<any>(
          `SELECT to_char(date, 'YYYY-MM-DD') AS date, overall_score::int AS score
           FROM daily_summaries
           WHERE user_id = $1 AND date >= $2 AND date <= $3 AND overall_score IS NOT NULL
           ORDER BY overall_score DESC`,
          [user_id, monthStart, monthEnd]
        ),
        // Same MAX-per-day convention as the weekly breakdown above.
        query<any>(
          `SELECT COALESCE(SUM(day_max), 0)::float AS total
           FROM (
             SELECT MAX(ml.value) AS day_max
             FROM metric_logs ml
             JOIN metrics m ON m.id = ml.metric_id
             WHERE m.user_id = $1 AND m.name = 'steps'
               AND ml.logged_at >= $2::date AND ml.logged_at < $3::date + interval '1 day'
               AND ml.value > 0
             GROUP BY ml.logged_at::date
           ) daily`,
          [user_id, monthStart, monthEnd]
        ),
      ]);

      const toNum = (v: any) => (v === null || v === undefined ? null : Number(v));
      const mapScores = (row: any) =>
        row
          ? {
              overall: toNum(row.overall), sleep: toNum(row.sleep), glucose: toNum(row.glucose),
              activity: toNum(row.activity), hydration: toNum(row.hydration), nutrition: toNum(row.nutrition),
              mood: toNum(row.mood), productivity: toNum(row.productivity), stress: toNum(row.stress),
            }
          : null;
      const scores = mapScores(scoreRows[0]);
      const prev_scores = mapScores(prevScoreRows[0]);
      const best_day = bestDayRows.length > 0 ? { date: bestDayRows[0].date, score: Number(bestDayRows[0].score) } : null;
      const worst_day =
        bestDayRows.length > 1
          ? { date: bestDayRows[bestDayRows.length - 1].date, score: Number(bestDayRows[bestDayRows.length - 1].score) }
          : null;

      // Best / worst weeks by steps
      let best_week: { start: string; total: number } | null = null;
      let worst_week: { start: string; total: number } | null = null;
      if (stepsRows.length > 0) {
        const toStr = (v: any) => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
        best_week = { start: toStr(stepsRows[0].week_start), total: Math.round(Number(stepsRows[0].total_steps)) };
        const worst = stepsRows[stepsRows.length - 1];
        worst_week = { start: toStr(worst.week_start), total: Math.round(Number(worst.total_steps)) };
        // If only one week, don't return a worst (same as best)
        if (stepsRows.length === 1) worst_week = null;
      }

      const spendTotal = Number(spendRows[0]?.total ?? 0);
      const prevSpendTotal = Number(prevSpendRows[0]?.total ?? 0);

      const mealDaysLogged = Number(mealDaysRows[0]?.days_logged ?? 0);
      let observation: string | null = null;
      if (mealDaysLogged > 0) {
        observation = `You logged meals on ${mealDaysLogged} of ${lastDay} days in ${new Date(prevYear, prevMonth - 1).toLocaleString("en-US", { month: "long" })}.`;
      }

      return {
        month: prevMonthStr,
        scores,
        prev_scores,
        best_day,
        worst_day,
        steps: {
          best_week,
          worst_week,
          total: Math.round(Number(totalStepsRows[0]?.total ?? 0)),
        },
        spending: {
          total: spendTotal,
          prev_total: prevSpendTotal,
        },
        observation,
      };
    } catch (err) {
      req.log.error({ err }, "monthly-review failed — returning empty payload");
      return {
        month: prevMonthStr,
        scores: null,
        prev_scores: null,
        best_day: null,
        worst_day: null,
        steps: { best_week: null, worst_week: null, total: null },
        spending: { total: null, prev_total: null },
        observation: null,
      };
    }
  });

  // GET /summary/monthly-narrative?month=YYYY-MM
  // Returns cached or freshly-generated LLM narrative for a calendar month.
  app.get("/monthly-narrative", async (req, reply) => {
    const user_id = req.user_id;
    const { month } = req.query as { month?: string };

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      reply.code(400);
      return { error: "month parameter required in YYYY-MM format" };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      reply.code(503);
      return { error: "Narrative generation is not configured on this server." };
    }

    try {
      const narrative = await getOrGenerateNarrative(user_id, month);
      return { month, narrative };
    } catch (err: any) {
      reply.code(503);
      return { error: "Could not generate narrative at this time." };
    }
  });

  // Combined day view: glucose readings + all events for the glucose overlay chart.
  app.get("/day", async (req) => {
    const user_id = req.user_id;
    const { date } = req.query as any;
    const day = date ?? estToday();

    const [glucose, mood, meals, spend] = await Promise.all([
      query<any>(
        `SELECT recorded_at, mg_dl::float FROM glucose_readings
         WHERE user_id = $1 AND recorded_at >= $2::date AND recorded_at < $2::date + interval '1 day' ORDER BY recorded_at`,
        [user_id, day]
      ),
      query<any>(
        `SELECT logged_at AS time, 'mood' AS type, entry_type, period,
                COALESCE(mood_label, mood_score::text) AS label, mood_score
         FROM journal_entries WHERE user_id = $1 AND logged_at >= $2::date AND logged_at < $2::date + interval '1 day'`,
        [user_id, day]
      ),
      query<any>(
        `SELECT logged_at AS time, 'meal' AS type, name AS label,
                (carbs_g * servings)::float AS carbs_g
         FROM meals WHERE user_id = $1 AND logged_at >= $2::date AND logged_at < $2::date + interval '1 day'`,
        [user_id, day]
      ),
      query<any>(
        `SELECT logged_at AS time, 'spend' AS type,
                ('$' || amount::int || COALESCE(' ' || category, '')) AS label
         FROM spending_entries WHERE user_id = $1 AND logged_at >= $2::date AND logged_at < $2::date + interval '1 day'`,
        [user_id, day]
      ),
    ]);

    const events = [...mood, ...meals, ...spend].sort(
      (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    return { glucose, events };
  });
}
