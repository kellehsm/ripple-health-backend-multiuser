import { FastifyInstance } from "fastify";
import { estToday } from "../lib/estDate.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Batch endpoint for the Overview screen — one round-trip instead of ~15.
// Reuses the existing route handlers via app.inject() so the per-domain
// logic stays in one place.
export default async function dashboardRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const { date } = req.query as any;
    const today = typeof date === "string" && DATE_RE.test(date) ? date : estToday();
    const authorization = req.headers.authorization ?? "";

    const dayMs = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    // Same window OverviewScreen used for the yesterday-glucose overlay
    const yStart = new Date(nowMs - dayMs - 16 * 3600 * 1000).toISOString();
    const yEnd = new Date(nowMs - dayMs).toISOString();

    const get = async (url: string) => {
      try {
        const res = await app.inject({ method: "GET", url, headers: { authorization } });
        if (res.statusCode >= 400) return null;
        return res.json();
      } catch {
        return null;
      }
    };

    const [
      journal_today,
      weekly_mood,
      pattern,
      weekly_digest,
      day,
      streaks,
      glucose_status,
      meals,
      steps,
      sleep_stats,
      daily_summary,
      insights,
      yesterday_glucose,
      glucose_tir,
      water,
    ] = await Promise.all([
      get("/api/journal/today"),
      get("/api/journal/weekly-summary"),
      get("/api/summary/pattern"),
      get("/api/summary/weekly-digest"),
      get("/api/summary/day?date=" + today),
      get("/api/summary/streaks"),
      get("/api/glucose/status"),
      get("/api/meals?date=" + today),
      get("/api/health-connect/steps?date=" + today),
      get("/api/health-connect/sleep/stats"),
      get("/api/summary/daily/" + today),
      get("/api/insights"),
      get("/api/glucose?start=" + encodeURIComponent(yStart) + "&end=" + encodeURIComponent(yEnd)),
      get("/api/glucose/tir?date=" + today),
      get("/api/metrics/water/today"),
    ]);

    return {
      date: today,
      journal_today,
      weekly_mood,
      pattern,
      weekly_digest,
      day,
      streaks,
      glucose_status,
      meals,
      steps,
      sleep_stats,
      daily_summary,
      insights,
      yesterday_glucose,
      glucose_tir,
      water,
    };
  });
}
