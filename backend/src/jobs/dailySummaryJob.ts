import { query } from "../db.js";
import { generateDailySummary } from "../services/dailySummaryService.js";

type LogLevel = "INFO" | "ERROR";
function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const line = `[dailySummaryJob] [${level}] ${msg}`;
  if (meta) (level === "ERROR" ? console.error : console.log)(line, meta);
  else (level === "ERROR" ? console.error : console.log)(line);
}

export async function runDailySummaryJob(date?: string): Promise<void> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  let users: Array<{ id: string }>;
  try {
    users = await query<{ id: string }>("SELECT id FROM users");
  } catch (err: unknown) {
    log("ERROR", "Failed to fetch users", { error: (err as Error)?.message });
    return;
  }

  log("INFO", `Generating summaries for ${users.length} user(s), date=${targetDate}`);

  const results = await Promise.allSettled(
    users.map(({ id: userId }) => generateDailySummary(userId, targetDate))
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
