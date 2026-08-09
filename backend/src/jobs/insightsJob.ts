import { query, pool } from "../db.js";
import { runInsightsForUser } from "../services/insightsEngine.js";
import { refreshAllBaselines } from "../services/baselines.js";
import { processEndedExperiments } from "../services/experimentOutcome.js";
import { computeGlobalPriors } from "../services/globalPriors.js";
import { sunsetLowHitRules } from "../services/ruleSunset.js";

// Arbitrary constant — must be the same across all callers of pg_advisory_lock.
// Picking a big, hand-chosen 64-bit int so it doesn't collide with anything else
// the app might advisory-lock in the future.
const INSIGHTS_JOB_LOCK_KEY = 8419283746512n;

export async function runInsightsJob(): Promise<void> {
  // Postgres advisory lock — a second invocation returns immediately instead of
  // running concurrently (which would double-write rows and thrash the DB).
  // Session-scoped so it releases automatically if the process crashes.
  const client = await pool.connect();
  try {
    const { rows: [lock] } = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired",
      [INSIGHTS_JOB_LOCK_KEY.toString()]
    );
    if (!lock?.acquired) {
      console.warn("[InsightsJob] previous run still in progress — skipping");
      return;
    }
    await runInsightsJobBody();
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [INSIGHTS_JOB_LOCK_KEY.toString()]);
    } catch { /* best-effort */ }
    client.release();
  }
}

async function runInsightsJobBody(): Promise<void> {
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
