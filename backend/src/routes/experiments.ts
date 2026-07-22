import { FastifyInstance } from "fastify";
import { query } from "../db.js";

interface Experiment {
  id: string;
  user_id: string;
  description: string;
  start_date: string;
  end_date: string;
  metrics: string[];
  status: string;
  created_at: string;
}

export default async function experimentsRoutes(app: FastifyInstance) {
  // POST / — create experiment
  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { description, duration_days, metrics } = req.body as any;
    const resolvedMetrics = metrics ?? ["glucose", "sleep", "mood"];
    const rows = await query<Experiment>(
      `INSERT INTO experiments (user_id, description, start_date, end_date, metrics)
       VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + ($3::int - 1), $4)
       RETURNING *`,
      [user_id, description, duration_days, resolvedMetrics]
    );
    return rows[0];
  });

  // GET / — list user's experiments (newest first, limit 20)
  app.get("/", async (req) => {
    const user_id = req.user_id;
    return query<Experiment>(
      `SELECT * FROM experiments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [user_id]
    );
  });

  // GET /:id — single experiment
  app.get("/:id", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const rows = await query<Experiment>(
      `SELECT * FROM experiments WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: "Not found" });
    return rows[0];
  });

  // PATCH /:id — update status only
  app.patch("/:id", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const { status } = req.body as any;
    const rows = await query<Experiment>(
      `UPDATE experiments SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [status, id, user_id]
    );
    if (!rows[0]) return reply.status(404).send({ error: "Not found" });
    return rows[0];
  });

  // GET /:id/results — before/after comparison
  app.get("/:id/results", async (req, reply) => {
    const user_id = req.user_id;
    const { id } = req.params as any;

    const expRows = await query<Experiment>(
      `SELECT * FROM experiments WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    if (!expRows[0]) return reply.status(404).send({ error: "Not found" });

    const experiment = expRows[0];

    // Calculate period in days
    const startDate = new Date(experiment.start_date);
    const endDate = new Date(experiment.end_date);
    const period_days =
      Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

    // Before window: (start_date - period_days) to (start_date - 1)
    const beforeStart = new Date(startDate.getTime() - period_days * 86400000)
      .toISOString()
      .slice(0, 10);
    const beforeEnd = new Date(startDate.getTime() - 86400000)
      .toISOString()
      .slice(0, 10);

    const duringStart = experiment.start_date;
    const duringEnd = experiment.end_date;

    const result: Record<string, any> = {
      experiment,
      period_days,
      has_before_data: false,
    };

    if (period_days <= 7) {
      result.hedge =
        "Early signal — a short window like this can be affected by normal day-to-day variation.";
    }

    const metrics: string[] = experiment.metrics;

    // Glucose TIR
    if (metrics.includes("glucose")) {
      const [beforeGlucose, duringGlucose] = await Promise.all([
        query<{ in_range: string; total: string }>(
          `SELECT
            COUNT(*) FILTER (WHERE mg_dl BETWEEN 70 AND 180) AS in_range,
            COUNT(*) AS total
           FROM glucose_readings
           WHERE user_id = $1 AND recorded_at::date BETWEEN $2 AND $3`,
          [user_id, beforeStart, beforeEnd]
        ),
        query<{ in_range: string; total: string }>(
          `SELECT
            COUNT(*) FILTER (WHERE mg_dl BETWEEN 70 AND 180) AS in_range,
            COUNT(*) AS total
           FROM glucose_readings
           WHERE user_id = $1 AND recorded_at::date BETWEEN $2 AND $3`,
          [user_id, duringStart, duringEnd]
        ),
      ]);

      const beforeTotal = Number(beforeGlucose[0]?.total ?? 0);
      const duringTotal = Number(duringGlucose[0]?.total ?? 0);

      result.glucose = {
        before_tir:
          beforeTotal > 0
            ? Math.round(
                (Number(beforeGlucose[0].in_range) / beforeTotal) * 100
              )
            : null,
        during_tir:
          duringTotal > 0
            ? Math.round(
                (Number(duringGlucose[0].in_range) / duringTotal) * 100
              )
            : null,
      };

      if (beforeTotal > 0) result.has_before_data = true;
    }

    // Sleep average hours
    if (metrics.includes("sleep")) {
      const [beforeSleep, duringSleep] = await Promise.all([
        query<{ avg_hours: string | null }>(
          `SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time))/3600) AS avg_hours
           FROM sleep_sessions
           WHERE user_id = $1 AND start_time::date BETWEEN $2 AND $3`,
          [user_id, beforeStart, beforeEnd]
        ),
        query<{ avg_hours: string | null }>(
          `SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time))/3600) AS avg_hours
           FROM sleep_sessions
           WHERE user_id = $1 AND start_time::date BETWEEN $2 AND $3`,
          [user_id, duringStart, duringEnd]
        ),
      ]);

      const beforeHrs = beforeSleep[0]?.avg_hours != null
        ? Math.round(Number(beforeSleep[0].avg_hours) * 10) / 10
        : null;
      const duringHrs = duringSleep[0]?.avg_hours != null
        ? Math.round(Number(duringSleep[0].avg_hours) * 10) / 10
        : null;

      result.sleep = {
        before_sleep_hrs: beforeHrs,
        during_sleep_hrs: duringHrs,
      };

      if (beforeHrs !== null) result.has_before_data = true;
    }

    // Mood average score
    if (metrics.includes("mood")) {
      const [beforeMood, duringMood] = await Promise.all([
        query<{ avg_mood: string | null }>(
          `SELECT AVG(mood_score) AS avg_mood
           FROM journal_entries
           WHERE user_id = $1 AND entry_type = 'mood' AND logged_at::date BETWEEN $2 AND $3`,
          [user_id, beforeStart, beforeEnd]
        ),
        query<{ avg_mood: string | null }>(
          `SELECT AVG(mood_score) AS avg_mood
           FROM journal_entries
           WHERE user_id = $1 AND entry_type = 'mood' AND logged_at::date BETWEEN $2 AND $3`,
          [user_id, duringStart, duringEnd]
        ),
      ]);

      const beforeAvg = beforeMood[0]?.avg_mood != null
        ? Math.round(Number(beforeMood[0].avg_mood) * 10) / 10
        : null;
      const duringAvg = duringMood[0]?.avg_mood != null
        ? Math.round(Number(duringMood[0].avg_mood) * 10) / 10
        : null;

      result.mood = {
        before_mood: beforeAvg,
        during_mood: duringAvg,
      };

      if (beforeAvg !== null) result.has_before_data = true;
    }

    return result;
  });
}
