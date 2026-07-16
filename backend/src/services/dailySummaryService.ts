import { query } from "../db.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailySummaryRow {
  id: string;
  user_id: string;
  date: string;
  sleep_score: number | null;
  glucose_score: number | null;
  activity_score: number | null;
  hydration_score: number | null;
  nutrition_score: number | null;
  mood_score: number | null;
  productivity_score: number | null;
  stress_score: number | null;
  overall_score: number | null;
  summary_data: Record<string, any>;
  insights: Array<{ type: string; message: string }>;
  created_at: string;
  updated_at: string;
}

// ─── Data gathering ───────────────────────────────────────────────────────────

async function getGlucoseData(userId: string, date: string) {
  const rows = await query<{ mg_dl: string }>(
    `SELECT mg_dl FROM glucose_readings
     WHERE user_id = $1 AND recorded_at::date = $2
     ORDER BY recorded_at`,
    [userId, date]
  );
  if (rows.length < 3) return null;

  const values = rows.map((r) => Number(r.mg_dl));
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const inRange = values.filter((v) => v >= 70 && v <= 180).length;
  const tir = Math.round((inRange / values.length) * 100);
  const spikes = values.filter((v) => v > 180).length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  const stdDev = Math.round(Math.sqrt(variance));

  return { average: Math.round(avg), timeInRange: tir, spikes, readingCount: values.length, stdDev };
}

async function getSleepData(userId: string, date: string) {
  const rows = await query<{ duration_minutes: string }>(
    `SELECT EXTRACT(EPOCH FROM (end_time - start_time)) / 60 AS duration_minutes
     FROM sleep_sessions
     WHERE user_id = $1 AND end_time::date = $2`,
    [userId, date]
  );
  if (rows.length === 0) return null;

  const totalMinutes = Math.round(rows.reduce((s, r) => s + Number(r.duration_minutes), 0));
  return { minutes: totalMinutes, hours: Math.round(totalMinutes / 6) / 10, sessions: rows.length };
}

async function getActivityData(userId: string, date: string) {
  const rows = await query<{ max_steps: string }>(
    `SELECT MAX(ml.value) AS max_steps
     FROM metric_logs ml
     JOIN metrics m ON m.id = ml.metric_id
     WHERE m.user_id = $1 AND m.name = 'steps' AND ml.logged_at::date = $2`,
    [userId, date]
  );
  const steps = rows[0]?.max_steps ? Math.round(Number(rows[0].max_steps)) : 0;
  if (steps === 0) return null;
  return { steps };
}

async function getHydrationData(userId: string, date: string) {
  const rows = await query<{ total: string }>(
    `SELECT COALESCE(SUM(ml.value), 0) AS total
     FROM metric_logs ml
     JOIN metrics m ON m.id = ml.metric_id
     WHERE m.user_id = $1 AND m.name = 'water' AND ml.logged_at::date = $2`,
    [userId, date]
  );
  const glasses = Math.round(Number(rows[0]?.total ?? 0));
  if (glasses === 0) return null;
  return { glasses };
}

async function getNutritionData(userId: string, date: string) {
  const rows = await query<{ calories: string | null; carbs_g: string | null }>(
    `SELECT calories, carbs_g FROM meals WHERE user_id = $1 AND logged_at::date = $2`,
    [userId, date]
  );
  if (rows.length === 0) return null;

  const totalCalories = Math.round(rows.reduce((s, r) => s + Number(r.calories ?? 0), 0));
  const hasCalories = rows.some((r) => r.calories !== null && Number(r.calories) > 0);
  const hasCarbs = rows.some((r) => r.carbs_g !== null && Number(r.carbs_g) > 0);

  return { mealCount: rows.length, totalCalories, hasCalories, hasCarbs };
}

async function getMoodData(userId: string, date: string) {
  const rows = await query<{ mood_score: string }>(
    `SELECT mood_score FROM journal_entries WHERE user_id = $1 AND logged_at::date = $2`,
    [userId, date]
  );
  if (rows.length === 0) return null;

  const scores = rows.map((r) => Number(r.mood_score));
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;

  return {
    averageScore: Math.round(avg * 10) / 10,
    entryCount: rows.length,
    highestMood: Math.max(...scores),
    lowestMood: Math.min(...scores),
  };
}

async function getProductivityData(userId: string, date: string) {
  const [pagesRows, hobbyRows] = await Promise.all([
    query<{ pages: string }>(
      `SELECT COALESCE(SUM(rl.pages_read), 0) AS pages
       FROM reading_logs rl
       JOIN books b ON b.id = rl.book_id
       WHERE b.user_id = $1 AND rl.logged_at = $2`,
      [userId, date]
    ),
    query<{ sessions: string }>(
      `SELECT COUNT(*) AS sessions
       FROM hobby_logs hl
       JOIN hobbies h ON h.id = hl.hobby_id
       WHERE h.user_id = $1 AND hl.logged_at::date = $2`,
      [userId, date]
    ),
  ]);

  const pagesRead = Number(pagesRows[0]?.pages ?? 0);
  const hobbySessions = Number(hobbyRows[0]?.sessions ?? 0);
  if (pagesRead === 0 && hobbySessions === 0) return null;
  return { pagesRead, hobbySessions };
}

// ─── Personal baselines ───────────────────────────────────────────────────────

async function getSleepBaseline(userId: string, beforeDate: string): Promise<number | null> {
  const rows = await query<{ avg_minutes: string }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 60) AS avg_minutes
     FROM sleep_sessions
     WHERE user_id = $1 AND end_time::date < $2 AND end_time::date >= $2::date - 7`,
    [userId, beforeDate]
  );
  const val = rows[0]?.avg_minutes;
  return val ? Math.round(Number(val)) : null;
}

async function getStepsBaseline(userId: string, beforeDate: string): Promise<number | null> {
  const rows = await query<{ avg_steps: string }>(
    `SELECT AVG(daily_max) AS avg_steps FROM (
       SELECT MAX(ml.value) AS daily_max
       FROM metric_logs ml
       JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'steps'
         AND ml.logged_at::date < $2 AND ml.logged_at::date >= $2::date - 30
       GROUP BY ml.logged_at::date
     ) t`,
    [userId, beforeDate]
  );
  const val = rows[0]?.avg_steps;
  return val ? Math.round(Number(val)) : null;
}

async function getWaterGoal(userId: string): Promise<number> {
  const rows = await query<{ settings: any }>(
    `SELECT settings FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  return Number(rows[0]?.settings?.water_goal ?? 8);
}

// ─── Score computations ───────────────────────────────────────────────────────

type GlucoseData = NonNullable<Awaited<ReturnType<typeof getGlucoseData>>>;
type SleepData = NonNullable<Awaited<ReturnType<typeof getSleepData>>>;
type NutritionData = NonNullable<Awaited<ReturnType<typeof getNutritionData>>>;
type MoodData = NonNullable<Awaited<ReturnType<typeof getMoodData>>>;
type ProductivityData = NonNullable<Awaited<ReturnType<typeof getProductivityData>>>;

function scoreGlucose(d: GlucoseData): number {
  // TIR 0-40, average 0-30, stdDev 0-15, spikes 0-15
  const tirPts = Math.round(d.timeInRange * 0.4);

  let avgPts = 0;
  if (d.average >= 70 && d.average <= 120) avgPts = 30;
  else if (d.average <= 140) avgPts = 20;
  else if (d.average <= 180) avgPts = 10;

  let sdPts = 0;
  if (d.stdDev <= 15) sdPts = 15;
  else if (d.stdDev <= 25) sdPts = 10;
  else if (d.stdDev <= 35) sdPts = 5;

  const spikePts = Math.max(0, 15 - d.spikes * 5);

  return Math.min(100, tirPts + avgPts + sdPts + spikePts);
}

function scoreSleep(d: SleepData, baselineMinutes: number | null): number {
  // Duration 0-60
  const m = d.minutes;
  let durationPts = 0;
  if (m >= 480 && m <= 540) durationPts = 60;
  else if (m >= 360) durationPts = Math.round(40 + ((m - 360) / 120) * 20);
  else if (m >= 240) durationPts = Math.round(((m - 240) / 120) * 40);
  else if (m > 540) durationPts = 50;

  // vs baseline 0-40
  let baselinePts = 30;
  if (baselineMinutes !== null) {
    const diff = Math.abs(m - baselineMinutes);
    if (diff <= 15) baselinePts = 40;
    else if (diff <= 30) baselinePts = 30;
    else if (diff <= 60) baselinePts = 20;
    else if (diff <= 90) baselinePts = 10;
    else baselinePts = 0;
  }

  return Math.min(100, durationPts + baselinePts);
}

function scoreActivity(steps: number, baseline: number | null): number {
  const target = baseline ?? 10000;
  return Math.min(100, Math.round((steps / target) * 100));
}

function scoreHydration(glasses: number, goal: number): number {
  return Math.min(100, Math.round((glasses / goal) * 100));
}

function scoreNutrition(d: NutritionData): number {
  const mealPts = Math.min(60, d.mealCount * 20);
  const macroPts = (d.hasCalories ? 20 : 0) + (d.hasCarbs ? 20 : 0);
  return Math.min(100, mealPts + macroPts);
}

function scoreMood(d: MoodData): number {
  return Math.round(((d.averageScore - 1) / 4) * 100);
}

function scoreProductivity(d: ProductivityData): number {
  const pagePts = Math.min(50, Math.round((d.pagesRead / 20) * 50));
  const hobbyPts = Math.min(50, d.hobbySessions * 25);
  return Math.min(100, pagePts + hobbyPts);
}

function scoreStress(d: MoodData): number {
  // High mood = low stress = high score
  const base = Math.round(((d.averageScore - 1) / 4) * 100);
  // Volatile day penalizes slightly
  const volatility = d.entryCount > 1 ? Math.round(((d.highestMood - d.lowestMood) / 4) * 15) : 0;
  return Math.max(0, Math.min(100, base - volatility));
}

function computeOverall(scores: Record<string, number | null>): number | null {
  const WEIGHTS: Record<string, number> = {
    glucose: 2, sleep: 2, activity: 1.5, hydration: 1,
    nutrition: 1, mood: 2, productivity: 1, stress: 0.5,
  };
  let weightedSum = 0, totalWeight = 0;
  for (const [key, score] of Object.entries(scores)) {
    if (score !== null && WEIGHTS[key] !== undefined) {
      weightedSum += score * WEIGHTS[key];
      totalWeight += WEIGHTS[key];
    }
  }
  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;
}

// ─── Insights ─────────────────────────────────────────────────────────────────

function buildInsights(params: {
  glucoseData: GlucoseData | null;
  sleepData: SleepData | null;
  activityData: { steps: number } | null;
  hydrationData: { glasses: number } | null;
  moodData: MoodData | null;
  sleepBaseline: number | null;
  stepsBaseline: number | null;
}): Array<{ type: string; message: string }> {
  const out: Array<{ type: string; message: string }> = [];
  const { glucoseData, sleepData, activityData, hydrationData, moodData, sleepBaseline, stepsBaseline } = params;

  if (glucoseData && glucoseData.readingCount >= 6) {
    if (glucoseData.timeInRange >= 90) {
      out.push({ type: "glucose", message: `Glucose was in range ${glucoseData.timeInRange}% of the day — great steadiness.` });
    } else if (glucoseData.timeInRange < 70) {
      out.push({ type: "glucose", message: `Glucose spent ${100 - glucoseData.timeInRange}% of the day outside the 70–180 mg/dL range.` });
    }
    if (glucoseData.spikes >= 3) {
      out.push({ type: "glucose", message: `${glucoseData.spikes} readings above 180 mg/dL recorded today.` });
    }
  }

  if (sleepData) {
    const h = Math.floor(sleepData.minutes / 60);
    const m = sleepData.minutes % 60;
    const label = m > 0 ? `${h}h ${m}m` : `${h}h`;
    if (sleepBaseline !== null) {
      const diff = sleepData.minutes - sleepBaseline;
      const abs = Math.abs(diff);
      if (abs >= 20) {
        const bh = Math.floor(abs / 60), bm = abs % 60;
        const diffLabel = bh > 0 ? `${bh}h${bm > 0 ? ` ${bm}m` : ""}` : `${bm}m`;
        const dir = diff > 0 ? "more" : "less";
        out.push({ type: "sleep", message: `You got ${label} of sleep — ${diffLabel} ${dir} than your recent average.` });
      } else {
        out.push({ type: "sleep", message: `You got ${label} of sleep, consistent with your recent pattern.` });
      }
    } else {
      out.push({ type: "sleep", message: `${label} of sleep recorded last night.` });
    }
  }

  if (activityData) {
    if (stepsBaseline) {
      const pct = Math.round((activityData.steps / stepsBaseline) * 100);
      if (pct >= 110) {
        out.push({ type: "activity", message: `${activityData.steps.toLocaleString()} steps — ${pct - 100}% above your usual pace.` });
      } else if (pct < 65) {
        out.push({ type: "activity", message: `${activityData.steps.toLocaleString()} steps today — below your usual pace.` });
      }
    } else if (activityData.steps >= 10000) {
      out.push({ type: "activity", message: `${activityData.steps.toLocaleString()} steps — you cleared 10k today.` });
    }
  }

  if (hydrationData && hydrationData.glasses < 4) {
    out.push({ type: "hydration", message: `Only ${hydrationData.glasses} glasses of water logged today — room to improve.` });
  }

  if (moodData) {
    if (moodData.averageScore >= 4) {
      out.push({ type: "mood", message: `Overall mood was positive today across ${moodData.entryCount} ${moodData.entryCount === 1 ? "entry" : "entries"}.` });
    } else if (moodData.averageScore <= 2) {
      out.push({ type: "mood", message: `Today included some lower-mood moments — ${moodData.entryCount} journal ${moodData.entryCount === 1 ? "entry" : "entries"} recorded.` });
    }
  }

  return out.slice(0, 4);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getDailySummary(userId: string, date: string): Promise<DailySummaryRow | null> {
  const rows = await query<DailySummaryRow>(
    `SELECT * FROM daily_summaries WHERE user_id = $1 AND date = $2`,
    [userId, date]
  );
  return rows[0] ?? null;
}

export async function generateDailySummary(userId: string, date: string): Promise<DailySummaryRow | null> {
  try {
    const [glucoseData, sleepData, activityData, hydrationData, nutritionData, moodData, productivityData] =
      await Promise.all([
        getGlucoseData(userId, date),
        getSleepData(userId, date),
        getActivityData(userId, date),
        getHydrationData(userId, date),
        getNutritionData(userId, date),
        getMoodData(userId, date),
        getProductivityData(userId, date),
      ]);

    const [sleepBaseline, stepsBaseline, waterGoal] = await Promise.all([
      getSleepBaseline(userId, date),
      getStepsBaseline(userId, date),
      getWaterGoal(userId),
    ]);

    const glucose_score = glucoseData ? scoreGlucose(glucoseData) : null;
    const sleep_score = sleepData ? scoreSleep(sleepData, sleepBaseline) : null;
    const activity_score = activityData ? scoreActivity(activityData.steps, stepsBaseline) : null;
    const hydration_score = hydrationData ? scoreHydration(hydrationData.glasses, waterGoal) : null;
    const nutrition_score = nutritionData ? scoreNutrition(nutritionData) : null;
    const mood_score = moodData ? scoreMood(moodData) : null;
    const productivity_score = productivityData ? scoreProductivity(productivityData) : null;
    const stress_score = moodData ? scoreStress(moodData) : null;

    const overall_score = computeOverall({
      glucose: glucose_score, sleep: sleep_score, activity: activity_score,
      hydration: hydration_score, nutrition: nutrition_score, mood: mood_score,
      productivity: productivity_score, stress: stress_score,
    });

    const summary_data = {
      glucose: glucoseData,
      sleep: sleepData ? { ...sleepData, baseline7DayMinutes: sleepBaseline } : null,
      activity: activityData ? { ...activityData, baseline30DaySteps: stepsBaseline } : null,
      hydration: hydrationData ? { ...hydrationData, goal: waterGoal } : null,
      nutrition: nutritionData,
      mood: moodData,
      productivity: productivityData,
    };

    const insights = buildInsights({ glucoseData, sleepData, activityData, hydrationData, moodData, sleepBaseline, stepsBaseline });

    const rows = await query<DailySummaryRow>(
      `INSERT INTO daily_summaries
         (user_id, date, sleep_score, glucose_score, activity_score, hydration_score,
          nutrition_score, mood_score, productivity_score, stress_score, overall_score,
          summary_data, insights, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
       ON CONFLICT (user_id, date) DO UPDATE SET
         sleep_score = EXCLUDED.sleep_score,
         glucose_score = EXCLUDED.glucose_score,
         activity_score = EXCLUDED.activity_score,
         hydration_score = EXCLUDED.hydration_score,
         nutrition_score = EXCLUDED.nutrition_score,
         mood_score = EXCLUDED.mood_score,
         productivity_score = EXCLUDED.productivity_score,
         stress_score = EXCLUDED.stress_score,
         overall_score = EXCLUDED.overall_score,
         summary_data = EXCLUDED.summary_data,
         insights = EXCLUDED.insights,
         updated_at = now()
       RETURNING *`,
      [userId, date, sleep_score, glucose_score, activity_score, hydration_score,
       nutrition_score, mood_score, productivity_score, stress_score, overall_score,
       JSON.stringify(summary_data), JSON.stringify(insights)]
    );

    return rows[0] ?? null;
  } catch (err: unknown) {
    console.error("[dailySummaryService] Failed", { userId, date, err: (err as Error)?.message });
    return null;
  }
}
