/**
 * Rule → user capability lookup used to compute the *eligible* denominator
 * for hit-rate + sunsetting. Without this, a rule that only makes sense for
 * cycle-tracking users gets divided by every user in the system, so its
 * hit_rate looks catastrophic on any mixed-user deployment and it gets
 * auto-archived on day 60 by `sunsetLowHitRules`.
 *
 * The list is intentionally centralized here (not sprinkled into rule
 * files) so it can be audited and adjusted without touching rule code.
 */

import type { UserCapabilities } from "../rules/types.js";

/** Mapping from rule_id to the capability that must be present. */
export const RULE_CAPABILITY: Record<string, keyof UserCapabilities> = {
  // Cycle-only rules
  cycle_vs_sleep:            "has_cycle",
  cycle_vs_mood:             "has_cycle",
  cycle_vs_glucose:          "has_cycle",
  spending_cycle_phase:      "has_cycle",
  symptom_clusters:          "has_cycle",
  symptom_lag_trigger:       "has_cycle",
  exercise_cycle_correlation:"has_cycle",

  // Medication-only rules
  medication_adherence_weekly:  "has_medications",
  missed_slot_pattern:          "has_medications",
  medication_glucose_correlation:"has_medications",
  medication_vs_mood:           "has_medications",

  // Glucose-only rules (require a CGM or manual glucose logs)
  glucose_time_of_day:         "has_glucose",
  meal_glucose_type:           "has_glucose",
  activity_vs_glucose:         "has_glucose",
  alcohol_quantity_vs_glucose: "has_glucose",
  glucose_variability:         "has_glucose",
  trend_glucose_variability:   "has_glucose",
  metabolic_score:             "has_glucose",
  sleep_vs_glucose:            "has_glucose",
  tri_sleep_exercise_glucose:  "has_glucose",
  quad_glucose_sleep_mood_steps:"has_glucose",
  mindfulness_vs_glucose:      "has_glucose",
  spending_vs_glucose:         "has_glucose",
  caffeine_vs_glucose:         "has_glucose",
  lag_sleep_glucose:           "has_glucose",
  meal_composition_glucose:    "has_glucose",

  // Substances (caffeine / alcohol)
  caffeine_vs_sleep:           "has_substances",
  alcohol_vs_sleep:            "has_substances",
  alcohol_vs_mood:             "has_substances",
  tri_caffeine_steps_sleep:    "has_substances",
  quad_caffeine_sleep_mood_steps:"has_substances",
  caffeine_dose_response:      "has_substances",

  // Heart-rate / HRV
  hrv_vs_sleep:                "has_hr",
  resting_hr_vs_exercise:      "has_hr",
  mindfulness_vs_resting_hr:   "has_hr",
  trend_resting_hr:            "has_hr",
};

/**
 * Postgres subquery that counts distinct users who satisfy the capability
 * required by a given rule. Rules with no capability requirement fall back
 * to the total user count (returned as `NULL` so the caller can COALESCE).
 *
 * Signals used to detect each capability:
 *   has_cycle       — any row in cycle_day_logs
 *   has_medications — any active row in medications
 *   has_glucose     — any row in glucose_readings
 *   has_substances  — any row in substance_logs
 *   has_hr          — any row in heart_rate_readings
 */
export function eligibleUsersSql(capability: keyof UserCapabilities): string {
  switch (capability) {
    case "has_cycle":
      return `(SELECT COUNT(DISTINCT user_id) FROM cycle_day_logs)`;
    case "has_medications":
      return `(SELECT COUNT(DISTINCT user_id) FROM medications)`;
    case "has_glucose":
      return `(SELECT COUNT(DISTINCT user_id) FROM glucose_readings)`;
    case "has_substances":
      return `(SELECT COUNT(DISTINCT user_id) FROM substance_logs)`;
    case "has_hr":
      return `(SELECT COUNT(DISTINCT user_id) FROM heart_rate_readings)`;
    case "medication_slots_count":
      // Not currently used as a gate here, but keep the switch exhaustive.
      return `(SELECT COUNT(*) FROM users)`;
  }
}

/** Async helper — returns count of eligible users for a given rule. */
import { query } from "../db.js";
export async function eligibleUserCount(ruleId: string, totalUsers: number): Promise<number> {
  const capability = RULE_CAPABILITY[ruleId];
  if (!capability) return totalUsers;
  const sql = eligibleUsersSql(capability);
  const [row] = await query<{ n: string | number }>(`SELECT ${sql} AS n`);
  const n = Number(row?.n ?? 0);
  // Never let the denominator hit zero — that would make hit_rate infinite.
  return Math.max(1, n);
}
