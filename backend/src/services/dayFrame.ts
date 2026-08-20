/**
 * Per-user "day frame" — a wide, pre-joined table of every daily metric for
 * one user, cached in memory for the duration of an insights-engine run.
 *
 * WHY: Each of the 76 insight rules used to fire its own overlapping SQL
 * (mostly against daily_summaries + a handful of raw tables). Building the
 * frame ONCE and letting every rule read from it drops engine time and DB
 * load 5–10×, and — more importantly — gives us a single, coherent view of
 * the user's data that all rules see. That's what makes it safe to layer on
 * lagged correlations, anomaly detection, confounder residualization, and
 * cross-rule dedup.
 *
 * Everything here is READ ONLY. Rules never mutate the frame.
 */

import { query } from "../db.js";
import { estDayOfWeekForDayStr } from "../lib/estDate.js";

export interface DayRow {
  date: string;                    // 'YYYY-MM-DD' in user's local calendar day
  dow: number;                     // 0..6 (0 = Sunday)
  isWeekend: boolean;

  // Sleep
  sleep_min:      number | null;
  sleep_quality:  number | null;
  bedtime_hour:   number | null;   // 0-23.99 fractional
  wake_hour:      number | null;
  rem_min:        number | null;
  deep_min:       number | null;
  wake_count:     number | null;

  // Activity
  steps:          number | null;
  exercise_min:   number | null;
  active_min:     number | null;

  // Vitals
  resting_hr:     number | null;
  hrv:            number | null;
  avg_hr:         number | null;

  // Glucose
  glucose_avg:    number | null;
  glucose_cv:     number | null;
  glucose_tir:    number | null;   // fraction in-range
  glucose_max:    number | null;
  glucose_min:    number | null;

  // Nutrition
  calories:       number | null;
  carbs_g:        number | null;
  protein_g:      number | null;
  fat_g:          number | null;
  fiber_g:        number | null;
  caffeine_mg:    number | null;
  alcohol_g:      number | null;
  water_glasses:  number | null;
  late_meal:      boolean | null;   // any meal after 21:00
  meal_count:     number | null;

  // Mood / journaling
  mood_score:     number | null;
  journaled:      boolean;

  // Cycle
  cycle_phase:    "menstrual" | "follicular" | "ovulatory" | "luteal" | null;

  // Behavior flags (used by habit-cluster miner)
  meditated:      boolean;
  read_book:      boolean;
  had_hobby:      boolean;

  // Spending
  spend_total:    number | null;

  // Environment
  weather_condition: string | null;
  stress_score:      number | null;
}

export interface DayFrame {
  userId: string;
  windowDays: number;                    // how many days back this frame covers
  rows: DayRow[];                        // ordered oldest -> newest
  byDate: Map<string, DayRow>;
  builtAt: number;                       // Date.now()
  // Cached column pulls, computed lazily on first access.
  col(field: keyof DayRow): number[];    // returns finite numbers only (skips nulls)
  colWithDates(field: keyof DayRow): { date: string; value: number }[];
}

interface RawSummary {
  date: string;
  summary_data: any;
}

/** Build a DayFrame for one user by pulling the last N days of daily_summaries
 * plus a handful of side-tables the summary doesn't cover. */
export async function buildDayFrame(userId: string, windowDays = 120): Promise<DayFrame> {
  // 1. daily_summaries is the canonical wide table.
  const summaries = await query<RawSummary>(
    `SELECT date::text AS date, summary_data
     FROM daily_summaries
     WHERE user_id = $1 AND date >= (NOW() AT TIME ZONE 'America/New_York')::date - $2::int
     ORDER BY date`,
    [userId, windowDays]
  );

  // 2. Side tables the summary either lacks or under-summarizes.
  //    Wrapped defensively — a missing table shouldn't break the run.
  const cycleRows = await safeQuery<{ date: string; phase: string }>(
    `SELECT log_date::text AS date, phase
     FROM cycle_day_logs
     WHERE user_id = $1 AND log_date >= (NOW() AT TIME ZONE 'America/New_York')::date - $2::int`,
    [userId, windowDays]
  );
  const cycleByDate = new Map(cycleRows.map(r => [r.date, r.phase]));

  const behaviorRows = await safeQuery<{ date: string; meditated: boolean; read_book: boolean; had_hobby: boolean }>(
    `WITH mind AS (
       SELECT logged_at::date AS d
       FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'mindfulness'
         AND ml.logged_at >= (NOW() AT TIME ZONE 'America/New_York')::date - $2::int
       GROUP BY logged_at::date
     ),
     read AS (
       SELECT logged_at::date AS d
       FROM reading_sessions
       WHERE user_id = $1 AND logged_at >= (NOW() AT TIME ZONE 'America/New_York')::date - $2::int
       GROUP BY logged_at::date
     ),
     hob AS (
       SELECT logged_at::date AS d
       FROM hobby_logs
       WHERE user_id = $1 AND logged_at >= (NOW() AT TIME ZONE 'America/New_York')::date - $2::int
       GROUP BY logged_at::date
     )
     SELECT COALESCE(mind.d, read.d, hob.d)::text AS date,
            (mind.d IS NOT NULL) AS meditated,
            (read.d IS NOT NULL) AS read_book,
            (hob.d IS NOT NULL) AS had_hobby
     FROM mind FULL OUTER JOIN read USING (d) FULL OUTER JOIN hob USING (d)`,
    [userId, windowDays]
  );
  const behByDate = new Map(behaviorRows.map(r => [r.date, r]));

  const stressRows = await safeQuery<{ date: string; score: number }>(
    `SELECT logged_at::date AS date, AVG(stress_score)::float AS score
     FROM journal_entries
     WHERE user_id = $1 AND stress_score IS NOT NULL
       AND logged_at >= (NOW() AT TIME ZONE 'America/New_York')::date - $2::int
     GROUP BY logged_at::date`,
    [userId, windowDays]
  );
  const stressByDate = new Map(stressRows.map(r => [r.date, Number(r.score)]));

  const weatherRows = await safeQuery<{ date: string; cond: string }>(
    `SELECT observed_at::date::text AS date, MAX(condition) AS cond
     FROM weather_observations
     WHERE user_id = $1 AND observed_at >= (NOW() AT TIME ZONE 'America/New_York')::date - $2::int
     GROUP BY observed_at::date`,
    [userId, windowDays]
  );
  const weatherByDate = new Map(weatherRows.map(r => [r.date, r.cond]));

  const rows: DayRow[] = summaries.map(s => {
    const sd = s.summary_data ?? {};
    const sleep = sd.sleep ?? {};
    const nutrition = sd.nutrition ?? sd.meals ?? {};
    const glucose = sd.glucose ?? {};
    const mood = sd.mood ?? {};
    const activity = sd.activity ?? sd.steps ?? {};
    const spending = sd.spending ?? {};

    // Anchor day-of-week in EST so it doesn't drift based on server tz.
    const dow = estDayOfWeekForDayStr(s.date);

    const beh = behByDate.get(s.date);

    return {
      date: s.date,
      dow,
      isWeekend: dow === 0 || dow === 6,

      sleep_min:     numOrNull(sleep.minutes),
      sleep_quality: numOrNull(sleep.quality ?? sleep.score),
      bedtime_hour:  numOrNull(sleep.bedtimeHour),
      wake_hour:     numOrNull(sleep.wakeHour),
      rem_min:       numOrNull(sleep.remMinutes),
      deep_min:      numOrNull(sleep.deepMinutes),
      wake_count:    numOrNull(sleep.wakeCount),

      steps:         numOrNull(activity.steps ?? sd.steps?.total),
      exercise_min:  numOrNull(activity.exerciseMinutes ?? sd.exercise?.minutes),
      active_min:    numOrNull(activity.activeMinutes),

      resting_hr:    numOrNull(sd.heartRate?.resting),
      hrv:           numOrNull(sd.heartRate?.hrv),
      avg_hr:        numOrNull(sd.heartRate?.average),

      glucose_avg:   numOrNull(glucose.average ?? glucose.mean),
      glucose_cv:    numOrNull(glucose.cv),
      glucose_tir:   numOrNull(glucose.tir ?? glucose.timeInRange),
      glucose_max:   numOrNull(glucose.max),
      glucose_min:   numOrNull(glucose.min),

      calories:      numOrNull(nutrition.calories),
      carbs_g:       numOrNull(nutrition.carbs ?? nutrition.carbs_g),
      protein_g:     numOrNull(nutrition.protein ?? nutrition.protein_g),
      fat_g:         numOrNull(nutrition.fat ?? nutrition.fat_g),
      fiber_g:       numOrNull(nutrition.fiber ?? nutrition.fiber_g),
      caffeine_mg:   numOrNull(nutrition.caffeine_mg ?? nutrition.caffeine),
      alcohol_g:     numOrNull(nutrition.alcohol_g ?? nutrition.alcohol),
      water_glasses: numOrNull(sd.water?.glasses ?? sd.water?.count),
      late_meal:     nutrition.hasLateMeal === true || nutrition.latestHour > 21,
      meal_count:    numOrNull(nutrition.mealCount),

      mood_score:    numOrNull(mood.averageScore ?? mood.average),
      journaled:     !!mood.journaled || !!sd.journal?.entries,

      cycle_phase:   (cycleByDate.get(s.date) as any) ?? null,

      meditated:     !!beh?.meditated,
      read_book:     !!beh?.read_book,
      had_hobby:     !!beh?.had_hobby,

      spend_total:   numOrNull(spending.total ?? spending.dollars),

      weather_condition: weatherByDate.get(s.date) ?? null,
      stress_score:      stressByDate.get(s.date) ?? null,
    };
  });

  const byDate = new Map(rows.map(r => [r.date, r]));
  const colCache = new Map<string, number[]>();
  const colDateCache = new Map<string, { date: string; value: number }[]>();

  return {
    userId,
    windowDays,
    rows,
    byDate,
    builtAt: Date.now(),
    col(field) {
      const k = String(field);
      let cached = colCache.get(k);
      if (!cached) {
        cached = [];
        for (const r of rows) {
          const v = (r as any)[field];
          if (typeof v === "number" && Number.isFinite(v)) cached.push(v);
        }
        colCache.set(k, cached);
      }
      return cached;
    },
    colWithDates(field) {
      const k = String(field);
      let cached = colDateCache.get(k);
      if (!cached) {
        cached = [];
        for (const r of rows) {
          const v = (r as any)[field];
          if (typeof v === "number" && Number.isFinite(v)) cached.push({ date: r.date, value: v });
        }
        colDateCache.set(k, cached);
      }
      return cached;
    },
  };
}

function numOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function safeQuery<T>(sql: string, params: any[]): Promise<T[]> {
  try {
    return await query<T>(sql, params);
  } catch {
    return [];
  }
}

/**
 * Helper: pair two columns by date, returning aligned (a, b) arrays with
 * both values non-null. Used by every correlational rule.
 */
export function pairColumns(
  frame: DayFrame,
  fieldA: keyof DayRow,
  fieldB: keyof DayRow,
): { a: number[]; b: number[]; dates: string[] } {
  const a: number[] = [], b: number[] = [], dates: string[] = [];
  for (const r of frame.rows) {
    const va = (r as any)[fieldA];
    const vb = (r as any)[fieldB];
    if (typeof va === "number" && Number.isFinite(va) && typeof vb === "number" && Number.isFinite(vb)) {
      a.push(va); b.push(vb); dates.push(r.date);
    }
  }
  return { a, b, dates };
}

/**
 * Lag-pair columns: value of fieldA on day N with value of fieldB on day N+lag.
 * lag = 1 asks "does today's A predict tomorrow's B?".
 */
export function lagPairColumns(
  frame: DayFrame,
  fieldA: keyof DayRow,
  fieldB: keyof DayRow,
  lag: number,
): { a: number[]; b: number[]; dates: string[] } {
  const a: number[] = [], b: number[] = [], dates: string[] = [];
  for (const r of frame.rows) {
    const va = (r as any)[fieldA];
    if (typeof va !== "number" || !Number.isFinite(va)) continue;
    // Compute the target calendar date by adding `lag` days.
    const d = new Date(r.date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + lag);
    const targetDate = d.toISOString().slice(0, 10);
    const targetRow = frame.byDate.get(targetDate);
    if (!targetRow) continue;
    const vb = (targetRow as any)[fieldB];
    if (typeof vb === "number" && Number.isFinite(vb)) {
      a.push(va); b.push(vb); dates.push(r.date);
    }
  }
  return { a, b, dates };
}
