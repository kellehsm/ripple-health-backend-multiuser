import { FastifyInstance } from "fastify";
import { query } from "../db.js";

const TREND_ARROWS: Record<string, string> = {
  DoubleUp: "⬆⬆",
  SingleUp: "⬆",
  FortyFiveUp: "⬆",
  Flat: "➡",
  FortyFiveDown: "⬇",
  SingleDown: "⬇",
  DoubleDown: "⬇⬇",
  NotComputable: "?",
  RateOutOfRange: "?",
};

const HIGH_THRESHOLD = 180;
const LOW_THRESHOLD = 70;
const STALE_MINUTES = 20;

export default async function glucoseStatusRoutes(app: FastifyInstance) {
  app.get("/status", async (req) => {
    const user_id = req.user_id;

    const readings = await query<any>(
      `SELECT recorded_at, mg_dl, trend FROM glucose_readings
       WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 2`,
      [user_id]
    );

    if (readings.length === 0) {
      return { hasData: false, message: "No glucose readings yet" };
    }

    const latest = readings[0];
    const previous = readings[1] ?? null;

    const delta = previous ? Math.round(latest.mg_dl - previous.mg_dl) : null;
    const arrow = TREND_ARROWS[latest.trend] ?? "?";

    const minutesSinceReading =
      (Date.now() - new Date(latest.recorded_at).getTime()) / 60000;
    const isStale = minutesSinceReading > STALE_MINUTES;

    const alerts: string[] = [];
    if (isStale) {
      alerts.push(`No new reading in ${Math.round(minutesSinceReading)} minutes - check sensor connection`);
    } else {
      if (latest.mg_dl >= HIGH_THRESHOLD) alerts.push(`High: ${latest.mg_dl} mg/dL`);
      if (latest.mg_dl <= LOW_THRESHOLD) alerts.push(`Low: ${latest.mg_dl} mg/dL`);
    }

    return {
      hasData: true,
      mg_dl: latest.mg_dl,
      trend: latest.trend,
      arrow,
      delta,
      recorded_at: latest.recorded_at,
      minutesSinceReading: Math.round(minutesSinceReading),
      isStale,
      alerts,
    };
  });
}
