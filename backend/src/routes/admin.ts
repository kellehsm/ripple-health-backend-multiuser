import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { adminSecretMatches } from "../lib/adminSecret.js";

// In-memory rate limit: max 5 failed secret attempts per IP per 15 minutes.
const ADMIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_RATE_MAX = 5;
const adminFailures = new Map<string, { count: number; windowStart: number }>();

function checkAdminRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = adminFailures.get(ip);
  if (!entry || now - entry.windowStart > ADMIN_RATE_WINDOW_MS) {
    adminFailures.set(ip, { count: 0, windowStart: now });
    return true; // allow
  }
  return entry.count < ADMIN_RATE_MAX;
}

function recordAdminFailure(ip: string): void {
  const now = Date.now();
  const entry = adminFailures.get(ip);
  if (!entry || now - entry.windowStart > ADMIN_RATE_WINDOW_MS) {
    adminFailures.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

export default async function adminRoutes(app: FastifyInstance) {
  // GET /api/admin/perf?limit=10
  // Requires x-admin-secret header. Returns the top slow queries by mean
  // execution time from pg_stat_statements — the extension has to be
  // enabled in postgresql.conf (shared_preload_libraries = pg_stat_statements),
  // otherwise the read returns { available: false }.
  app.get("/perf", async (req, reply) => {
    const ip = req.ip;
    if (!checkAdminRateLimit(ip)) {
      return reply.code(429).send({ error: "Too many failed attempts" });
    }
    if (!adminSecretMatches(req.headers["x-admin-secret"] as string | undefined)) {
      recordAdminFailure(ip);
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const limit = Math.min(50, Math.max(1, Number((req.query as any)?.limit ?? 10)));

    // Probe the extension — pg_stat_statements isn't in the default template
    // so calls will fail on a stock install. Return a friendly payload
    // instead of a 500.
    const ext = await query<{ available: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') AS available`
    );
    if (!ext[0]?.available) {
      return {
        available: false,
        hint: "Enable pg_stat_statements: add to shared_preload_libraries in postgresql.conf, restart, then CREATE EXTENSION pg_stat_statements.",
      };
    }

    const rows = await query<any>(
      `SELECT
         calls,
         ROUND(mean_exec_time::numeric, 2) AS mean_ms,
         ROUND(total_exec_time::numeric, 0) AS total_ms,
         rows,
         SUBSTRING(query FROM 1 FOR 200) AS query
       FROM pg_stat_statements
       WHERE query NOT ILIKE '%pg_stat_statements%'
         AND query NOT ILIKE 'COMMIT%'
         AND query NOT ILIKE 'BEGIN%'
       ORDER BY mean_exec_time DESC
       LIMIT $1`,
      [limit]
    );
    return { available: true, top: rows };
  });

  // GET /api/admin/health-summary — one-shot dashboard for ops.
  // Row counts on hot tables + last-hour activity, so we can eyeball whether
  // the app is idle, active, or on fire without a shell.
  app.get("/health-summary", async (req, reply) => {
    const ip = req.ip;
    if (!checkAdminRateLimit(ip)) {
      return reply.code(429).send({ error: "Too many failed attempts" });
    }
    if (!adminSecretMatches(req.headers["x-admin-secret"] as string | undefined)) {
      recordAdminFailure(ip);
      return reply.code(401).send({ error: "Unauthorized" });
    }
    const [counts] = await query<any>(
      `SELECT
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM meals WHERE logged_at > NOW() - INTERVAL '1 hour') AS meals_hour,
         (SELECT COUNT(*) FROM glucose_readings WHERE recorded_at > NOW() - INTERVAL '1 hour') AS glucose_hour,
         (SELECT COUNT(*) FROM exercise_sessions WHERE started_at > NOW() - INTERVAL '1 hour') AS workouts_hour,
         (SELECT COUNT(*) FROM error_reports WHERE created_at > NOW() - INTERVAL '1 hour') AS errors_hour,
         (SELECT MAX(recorded_at) FROM glucose_readings) AS last_glucose_at`
    );
    return counts ?? {};
  });
}
