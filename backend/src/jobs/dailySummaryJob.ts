import { query, pool } from "../db.js";
import { generateDailySummary } from "../services/dailySummaryService.js";
import { estToday } from "../lib/estDate.js";

type StructuredLogger = { info: (obj: Record<string, unknown> | string, msg?: string) => void; error: (obj: Record<string, unknown> | string, msg?: string) => void };

let _logger: StructuredLogger | null = null;
export function setDailySummaryLogger(logger: StructuredLogger) { _logger = logger; }

function log(level: "INFO" | "ERROR", msg: string, meta?: Record<string, unknown>) {
  if (_logger) {
    if (level === "ERROR") _logger.error(meta ?? {}, `[dailySummaryJob] ${msg}`);
    else _logger.info(meta ?? {}, `[dailySummaryJob] ${msg}`);
  } else {
    const line = `[dailySummaryJob] [${level}] ${msg}`;
    if (meta) (level === "ERROR" ? console.error : console.log)(line, meta);
    else (level === "ERROR" ? console.error : console.log)(line);
  }
}

// Distinct lock key — must not collide with INSIGHTS_JOB_LOCK_KEY (8419283746512)
const DAILY_SUMMARY_LOCK_KEY = 7312948561023n;

export async function runDailySummaryJob(date?: string): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows: [lock] } = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [DAILY_SUMMARY_LOCK_KEY.toString()]
    );
    if (!lock?.acquired) {
      log("INFO", "previous run still in progress — skipping");
      return;
    }
    await runDailySummaryJobBody(date);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [DAILY_SUMMARY_LOCK_KEY.toString()]);
    } catch { /* best-effort */ }
    client.release();
  }
}

async function runDailySummaryJobBody(date?: string): Promise<void> {
  const targetDate = date ?? estToday();

  // Single aggregate pre-flight: fetch the set of user IDs that have any data
  // for targetDate across all tracked sources. Replaces the previous N+1 pattern
  // (one EXISTS query per user) with one query for all users.
  let usersWithData: Set<string>;
  let allUsers: Array<{ id: string }>;
  try {
    const [dataRows, userRows] = await Promise.all([
      query<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM (
           SELECT user_id FROM journal_entries
             WHERE logged_at >= $1::date AND logged_at < $1::date + INTERVAL '1 day'
           UNION ALL
           SELECT user_id FROM glucose_readings
             WHERE recorded_at >= $1::date AND recorded_at < $1::date + INTERVAL '1 day'
           UNION ALL
           SELECT user_id FROM meals
             WHERE logged_at >= $1::date AND logged_at < $1::date + INTERVAL '1 day'
           UNION ALL
           SELECT user_id FROM sleep_sessions
             WHERE end_time >= $1::date AND end_time < $1::date + INTERVAL '1 day'
           UNION ALL
           SELECT m.user_id FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id
             WHERE ml.logged_at >= $1::date AND ml.logged_at < $1::date + INTERVAL '1 day'
           UNION ALL
           SELECT user_id FROM reading_logs WHERE logged_at = $1::date
           UNION ALL
           SELECT user_id FROM hobby_logs WHERE logged_at::date = $1::date
         ) AS combined`,
        [targetDate]
      ),
      query<{ id: string }>("SELECT id FROM users"),
    ]);
    usersWithData = new Set(dataRows.map((r) => r.user_id));
    allUsers = userRows;
  } catch (err: unknown) {
    log("ERROR", "Failed to fetch users", { error: (err as Error)?.message });
    return;
  }

  const users = allUsers.filter(({ id }) => usersWithData.has(id));
  log("INFO", `Generating summaries for ${users.length}/${allUsers.length} user(s) with data, date=${targetDate}`);

  const results = await Promise.allSettled(
    users.map(async ({ id: userId }) => {
      return generateDailySummary(userId, targetDate);
    })
  );

  for (let i = 0; i < users.length; i++) {
    const { id: userId } = users[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      if (result.value) {
        log("INFO", "Summary saved", { userId, date: targetDate, overall: result.value.overall_score });
      }
    } else {
      log("ERROR", "Failed for user", { userId, date: targetDate, error: (result.reason as Error)?.message });
    }
  }
}
