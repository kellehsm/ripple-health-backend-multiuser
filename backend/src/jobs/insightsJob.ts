import { query } from "../db.js";
import { runInsightsForUser } from "../services/insightsEngine.js";
import { refreshAllBaselines } from "../services/baselines.js";

export async function runInsightsJob(): Promise<void> {
  // Refresh personalized baselines before the rules run so tertile / trend
  // comparisons work against fresh per-user distributions instead of stale
  // ones from last week.
  try {
    const b = await refreshAllBaselines();
    console.log(`[InsightsJob] baselines refreshed: ${b.users} users, ${b.totalMetricsWritten} metric rows written`);
  } catch (err: any) {
    console.error(`[InsightsJob] baselines refresh failed:`, err?.message);
  }

  const users = await query<{ id: string }>("SELECT id FROM users");

  const results = await Promise.allSettled(users.map(({ id }) => runInsightsForUser(id)));

  for (let i = 0; i < users.length; i++) {
    const { id } = users[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      if (result.value.errors.length > 0) {
        console.error(`[InsightsJob] user ${id} rule errors:`, result.value.errors);
      }
      console.log(`[InsightsJob] user ${id}: ${result.value.found}/${result.value.ran} rules produced insights`);
    } else {
      console.error(`[InsightsJob] failed for user ${id}:`, (result.reason as any)?.message);
    }
  }
}
