/**
 * monthlyNarrative.ts
 * Generates (and caches) a ~150-word friendly monthly narrative for a user
 * using the Anthropic API. Cached in monthly_narratives table; generated
 * on-demand the first time a user requests a given month.
 */

import Anthropic from "@anthropic-ai/sdk";
import { query } from "../db.js";

const MODEL = "claude-sonnet-4-6";
const NARRATIVE_MAX_TOKENS = 350;
const LLM_TIMEOUT_MS = 25_000;

export interface MonthlyNarrativeStats {
  month: string; // 'YYYY-MM'
  scores: Record<string, number | null> | null;
  best_day: { date: string; score: number } | null;
  worst_day: { date: string; score: number } | null;
  steps_total: number | null;
  spending_total: number | null;
  top_insights: string[];
}

/** Fetch aggregate stats for a calendar month from daily_summaries. */
export async function fetchMonthStats(user_id: string | number, month: string): Promise<MonthlyNarrativeStats> {
  const [year, mon] = month.split("-").map(Number);
  const monthStart = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const monthEnd = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const scoreAvgSql = `
    SELECT
      ROUND(AVG(overall_score))::int      AS overall,
      ROUND(AVG(sleep_score))::int        AS sleep,
      ROUND(AVG(glucose_score))::int      AS glucose,
      ROUND(AVG(activity_score))::int     AS activity,
      ROUND(AVG(hydration_score))::int    AS hydration,
      ROUND(AVG(nutrition_score))::int    AS nutrition,
      ROUND(AVG(mood_score))::int         AS mood,
      ROUND(AVG(productivity_score))::int AS productivity,
      ROUND(AVG(stress_score))::int       AS stress
    FROM daily_summaries
    WHERE user_id = $1 AND date >= $2 AND date <= $3`;

  const [scoreRows, bestDayRows, stepsRows, spendRows, insightRows] = await Promise.all([
    query<any>(scoreAvgSql, [user_id, monthStart, monthEnd]),
    query<any>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, overall_score::int AS score
       FROM daily_summaries
       WHERE user_id = $1 AND date >= $2 AND date <= $3 AND overall_score IS NOT NULL
       ORDER BY overall_score DESC`,
      [user_id, monthStart, monthEnd]
    ),
    query<any>(
      `SELECT COALESCE(SUM(ml.value), 0)::float AS total
       FROM metric_logs ml
       JOIN metrics m ON m.id = ml.metric_id
       WHERE m.user_id = $1 AND m.name = 'steps'
         AND ml.logged_at::date >= $2 AND ml.logged_at::date <= $3
         AND ml.value > 0`,
      [user_id, monthStart, monthEnd]
    ),
    query<any>(
      `SELECT COALESCE(SUM(amount), 0)::float AS total
       FROM spending_entries
       WHERE user_id = $1 AND logged_at::date >= $2 AND logged_at::date <= $3`,
      [user_id, monthStart, monthEnd]
    ),
    // Top active insights by confidence for narrative context
    query<any>(
      `SELECT title FROM user_insights
       WHERE user_id = $1 AND active = true AND dismissed = false
       ORDER BY confidence DESC NULLS LAST
       LIMIT 5`,
      [user_id]
    ),
  ]);

  const toNum = (v: any) => (v === null || v === undefined ? null : Number(v));
  const sr = scoreRows[0];
  const scores = sr
    ? {
        overall: toNum(sr.overall),
        sleep: toNum(sr.sleep),
        glucose: toNum(sr.glucose),
        activity: toNum(sr.activity),
        hydration: toNum(sr.hydration),
        nutrition: toNum(sr.nutrition),
        mood: toNum(sr.mood),
        productivity: toNum(sr.productivity),
        stress: toNum(sr.stress),
      }
    : null;

  const best_day =
    bestDayRows.length > 0
      ? { date: bestDayRows[0].date, score: Number(bestDayRows[0].score) }
      : null;
  const worst_day =
    bestDayRows.length > 1
      ? {
          date: bestDayRows[bestDayRows.length - 1].date,
          score: Number(bestDayRows[bestDayRows.length - 1].score),
        }
      : null;

  return {
    month,
    scores,
    best_day,
    worst_day,
    steps_total: stepsRows[0]?.total ? Math.round(Number(stepsRows[0].total)) : null,
    spending_total: spendRows[0]?.total ? Number(spendRows[0].total) : null,
    top_insights: insightRows.map((r: any) => r.title as string),
  };
}

/** Build the prompt text from stats. */
function buildPrompt(stats: MonthlyNarrativeStats): string {
  const [y, m] = stats.month.split("-").map(Number);
  const monthName = new Date(y, m - 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const lines: string[] = [`Month: ${monthName}`];
  if (stats.scores?.overall != null) lines.push(`Average wellness score: ${stats.scores.overall}/100`);
  if (stats.scores) {
    const domains = ["sleep", "glucose", "activity", "hydration", "nutrition", "mood", "productivity", "stress"];
    const domainStr = domains
      .filter((d) => stats.scores![d] != null)
      .map((d) => `${d}: ${stats.scores![d]}`)
      .join(", ");
    if (domainStr) lines.push(`Domain scores — ${domainStr}`);
  }
  if (stats.best_day) lines.push(`Best day: ${stats.best_day.date} (score ${stats.best_day.score})`);
  if (stats.worst_day) lines.push(`Toughest day: ${stats.worst_day.date} (score ${stats.worst_day.score})`);
  if (stats.steps_total) lines.push(`Total steps: ${stats.steps_total.toLocaleString()}`);
  if (stats.spending_total) lines.push(`Total spending: $${stats.spending_total.toFixed(0)}`);
  if (stats.top_insights.length > 0) lines.push(`Active patterns: ${stats.top_insights.join("; ")}`);

  return lines.join("\n");
}

/** Call Anthropic to generate the narrative. */
async function callLLM(stats: MonthlyNarrativeStats, apiKey: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  const systemText =
    "You are Ripple's wellness assistant writing a warm, friendly monthly recap narrative for the user. " +
    "Write approximately 150 words in second person (\"you\", \"your\"). " +
    "Be descriptive and encouraging. " +
    "You may note observational patterns (e.g. \"your mood scores ran higher mid-month\") but never imply causation or give medical advice. " +
    "Do not mention scores as bare numbers more than once — weave them into narrative. " +
    "End with a brief forward-looking sentence. " +
    "Plain prose only — no bullet points, no markdown headers.";

  const userText =
    "Here is a summary of my wellness data for this month. Write my monthly narrative.\n\n" +
    buildPrompt(stats);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const response = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: NARRATIVE_MAX_TOKENS,
        system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userText }],
      },
      { signal: controller.signal }
    );

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!text) throw new Error("Empty LLM response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the cached narrative for (user_id, month), or generates + caches one.
 * Throws if the LLM call fails and no cache exists.
 */
export async function getOrGenerateNarrative(user_id: string | number, month: string): Promise<string> {
  // Check cache first
  const cached = await query<{ narrative: string }>(
    `SELECT narrative FROM monthly_narratives WHERE user_id = $1 AND month = $2`,
    [user_id, month]
  );
  if (cached.length > 0) return cached[0].narrative;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const stats = await fetchMonthStats(user_id, month);
  const narrative = await callLLM(stats, apiKey);

  // Upsert into cache (concurrent requests may race — ON CONFLICT is safe)
  await query(
    `INSERT INTO monthly_narratives (user_id, month, narrative)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, month) DO NOTHING`,
    [user_id, month, narrative]
  );

  return narrative;
}
