import { query } from "../db.js";
import { generateDailySummary } from "../services/dailySummaryService.js";
import { estToday } from "../lib/estDate.js";

type LogLevel = "INFO" | "ERROR";
function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const line = `[dailySummaryJob] [${level}] ${msg}`;
  if (meta) (level === "ERROR" ? console.error : console.log)(line, meta);
  else (level === "ERROR" ? console.error : console.log)(line);
}

export async function runDailySummaryJob(date?: string): Promise<void> {
  const targetDate = date ?? estToday();

  let users: Array<{ id: string }>;
  try {
    users = await query<{ id: string }>("SELECT id FROM users");
  } catch (err: unknown) {
    log("ERROR", "Failed to fetch users", { error: (err as Error)?.message });
    return;
  }

  log("INFO", `Generating summaries for ${users.length} user(s), date=${targetDate}`);

  const results = await Promise.allSettled(
    users.map(async ({ id: userId }) => {
      // Pre-flight: skip users with no data at all today to avoid wasteful queries
      const [{ has_data }] = await query<{ has_data: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM journal_entries
           WHERE user_id = $1 AND logged_at >= $2::date AND logged_at < $2::date + INTERVAL '1 day'
           UNION ALL
           SELECT 1 FROM glucose_readings
           WHERE user_id = $1 AND recorded_at >= $2::date AND recorded_at < $2::date + INTERVAL '1 day'
           LIMIT 1
         ) AS has_data`,
        [userId, targetDate]
      );
      if (!has_data) return null;
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
