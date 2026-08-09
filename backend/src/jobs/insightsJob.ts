import { query } from "../db.js";
import { runInsightsForUser } from "../services/insightsEngine.js";
import { refreshAllBaselines } from "../services/baselines.js";
import { processEndedExperiments } from "../services/experimentOutcome.js";
import { computeGlobalPriors } from "../services/globalPriors.js";
import { sunsetLowHitRules } from "../services/ruleSunset.js";

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
      console.log(`[InsightsJob] user ${id}: ${result.value.found}/${result.value.ran} rules fired in ${result.value.runMs}ms`);
    } else {
      console.error(`[InsightsJob] failed for user ${id}:`, (result.reason as any)?.message);
    }
  }

  // Post-run housekeeping.
  try {
    const outcomes = await processEndedExperiments();
    console.log(`[InsightsJob] experiment outcomes emitted: ${outcomes.processed}`);
  } catch (err: any) { console.error(`[InsightsJob] outcome processing failed:`, err?.message); }

  try {
    const priors = await computeGlobalPriors();
    console.log(`[InsightsJob] global priors updated for ${priors.rules} rules`);
  } catch (err: any) { console.error(`[InsightsJob] global priors failed:`, err?.message); }

  try {
    const sunset = await sunsetLowHitRules();
    console.log(`[InsightsJob] rule sunset: ${sunset.archived} rules archived`);
  } catch (err: any) { console.error(`[InsightsJob] sunset failed:`, err?.message); }
}
