import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

export const ReadingVsMoodRule: InsightRule = {
  id: "reading_vs_mood",
  type: "books",
  minDays: 15,

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{ date: string; pages_read: number; avg_mood: number }>(
      `SELECT
         ds.date::text AS date,
         COALESCE((ds.summary_data->'productivity'->>'pagesRead')::numeric, 0) AS pages_read,
         (ds.summary_data->'mood'->>'averageScore')::numeric AS avg_mood
       FROM daily_summaries ds
       WHERE ds.user_id = $1
         AND ds.date >= CURRENT_DATE - 90
         AND ds.summary_data->'mood'->>'averageScore' IS NOT NULL
       ORDER BY ds.date DESC`,
      [userId]
    );

    if (rows.length < 15) return null;

    const readingDays    = rows.filter(r => Number(r.pages_read) > 0);
    const nonReadingDays = rows.filter(r => Number(r.pages_read) === 0);

    if (readingDays.length < 5 || nonReadingDays.length < 5) return null;

    const avgMoodReading    = readingDays.reduce((s, r) => s + Number(r.avg_mood), 0) / readingDays.length;
    const avgMoodNoReading  = nonReadingDays.reduce((s, r) => s + Number(r.avg_mood), 0) / nonReadingDays.length;

    const diff = avgMoodReading - avgMoodNoReading;
    if (Math.abs(diff) < 0.2) return null;

    const effectRatio = Math.abs(diff) / 4;
    const { score, label } = calcConfidence(Math.min(readingDays.length, nonReadingDays.length), effectRatio);

    const avgPagesOnReadingDays = Math.round(readingDays.reduce((s, r) => s + Number(r.pages_read), 0) / readingDays.length);
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: "Reading days tend to have better mood",
      description: `Over the last 90 days, on the ${readingDays.length} days you read (avg ${avgPagesOnReadingDays} pages) your mood averaged ${avgMoodReading.toFixed(1)}/5, versus ${avgMoodNoReading.toFixed(1)}/5 on days without reading.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: readingDays.length,
      supportingData: {
        days_analyzed: rows.length,
        reading_days: readingDays.length,
        non_reading_days: nonReadingDays.length,
        avg_mood_reading: avgMoodReading.toFixed(2),
        avg_mood_no_reading: avgMoodNoReading.toFixed(2),
        mood_difference: diff.toFixed(2),
        avg_pages_on_reading_days: avgPagesOnReadingDays,
        direction,
      },
    };
  },
};
