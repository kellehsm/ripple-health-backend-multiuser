import { query, pool } from "../db.js";
import { runInsightsForUser } from "../services/insightsEngine.js";
import { refreshAllBaselines } from "../services/baselines.js";
import { processEndedExperiments } from "../services/experimentOutcome.js";
import { computeGlobalPriors } from "../services/globalPriors.js";
import { sunsetLowHitRules } from "../services/ruleSunset.js";

type StructuredLogger = { info: (obj: Record<string, unknown> | string, msg?: string) => void; warn: (obj: Record<string, unknown> | string, msg?: string) => void; error: (obj: Record<string, unknown> | string, msg?: string) => void };

let _logger: StructuredLogger | null = null;
export function setInsightsLogger(logger: StructuredLogger) { _logger = logger; }

function ilog(msg: string, meta?: Record<string, unknown>) {
  if (_logger) _logger.info(meta ?? {}, `[InsightsJob] ${msg}`);
  else console.log(`[InsightsJob] ${msg}`, meta ?? "");
}
function iwarn(msg: string, meta?: Record<string, unknown>) {
  if (_logger) _logger.warn(meta ?? {}, `[InsightsJob] ${msg}`);
  else console.warn(`[InsightsJob] ${msg}`, meta ?? "");
}
function ierror(msg: string, meta?: Record<string, unknown>) {
  if (_logger) _logger.error(meta ?? {}, `[InsightsJob] ${msg}`);
  else console.error(`[InsightsJob] ${msg}`, meta ?? "");
}

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
      iwarn("previous run still in progress — skipping");
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
    ilog(`baselines refreshed: ${b.users} users, ${b.totalMetricsWritten} metric rows written`);
  } catch (err: any) {
    ierror("baselines refresh failed", { error: err?.message });
  }

  const users = await query<{ id: string }>("SELECT id FROM users");

  const results = await Promise.allSettled(users.map(({ id }) => runInsightsForUser(id)));

  for (let i = 0; i < users.length; i++) {
    const { id } = users[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      if (result.value.errors.length > 0) {
        ierror(`user ${id} rule errors`, { errors: result.value.errors });
      }
      ilog(`user ${id}: ${result.value.found}/${result.value.ran} rules fired in ${result.value.runMs}ms`);
    } else {
      ierror(`failed for user ${id}`, { error: (result.reason as any)?.message });
    }
  }

  // Post-run housekeeping.
  try {
    const outcomes = await processEndedExperiments();
    ilog(`experiment outcomes emitted: ${outcomes.processed}`);
  } catch (err: any) { ierror("outcome processing failed", { error: err?.message }); }

  try {
    const priors = await computeGlobalPriors();
    ilog(`global priors updated for ${priors.rules} rules`);
  } catch (err: any) { ierror("global priors failed", { error: err?.message }); }

  try {
    const sunset = await sunsetLowHitRules();
    ilog(`rule sunset: ${sunset.archived} rules archived`);
  } catch (err: any) { ierror("sunset failed", { error: err?.message }); }
}
