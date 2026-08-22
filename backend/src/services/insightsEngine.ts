import { query } from "../db.js";
import { estDayOfWeek } from "../lib/estDate.js";
import type { InsightRule, InsightResult, RuleTier, UserCapabilities } from "../rules/types.js";
import { buildDayFrame } from "./dayFrame.js";
import { benjaminiHochberg, passesMDE, MDE } from "../rules/stats.js";
import { rankAndPersist, dedupInsights } from "./insightRanker.js";
import { archivedRuleIds } from "./ruleSunset.js";
import { SleepVsMoodRule } from "../rules/sleepVsMood.js";
import { ActivityVsGlucoseRule } from "../rules/activityVsGlucose.js";
import { ReadingVsMoodRule } from "../rules/readingVsMood.js";
import { HobbyVsMoodRule } from "../rules/hobbyVsMood.js";
import { WaterConsistencyRule } from "../rules/waterConsistency.js";
import { WeekendSpendingRule } from "../rules/weekendSpending.js";
import { MealGlucoseTypeRule } from "../rules/mealGlucoseType.js";
import { GlucoseTimeOfDayRule } from "../rules/glucoseTimeOfDay.js";
import { SpendingVsMoodRule } from "../rules/spendingVsMood.js";
import { MealStreakRule, WaterStreakRule, StepGoalStreakRule } from "../rules/streaks.js";
import { MedicationAdherenceRule } from "../rules/medicationAdherence.js";
import { MissedSlotRule } from "../rules/missedSlot.js";
import { ExerciseConsistencyRule } from "../rules/exerciseConsistency.js";
import { UndertrainedMuscleRule } from "../rules/undertrainedMuscle.js";
import { ExerciseCycleCorrelationRule } from "../rules/exerciseCycleCorrelation.js";
import { MedicationGlucoseCorrelationRule } from "../rules/medicationGlucoseCorrelation.js";
import { SpendingVsExerciseRule } from "../rules/spendingVsExercise.js";
import { SpendingVsGlucoseRule } from "../rules/spendingVsGlucose.js";
import { SpendingCyclePhaseRule } from "../rules/spendingCyclePhase.js";
import { CycleVsSleepRule } from "../rules/cycleVsSleep.js";
import { CycleVsMoodRule } from "../rules/cycleVsMood.js";
import { CycleVsGlucoseRule } from "../rules/cycleVsGlucose.js";
import { MedicationVsMoodRule } from "../rules/medicationVsMood.js";
import { MoodVariabilityRule } from "../rules/moodVariabilityRule.js";
import { SleepConsistencyRule } from "../rules/sleepConsistencyRule.js";
import { SleepVsGlucoseRule } from "../rules/sleepVsGlucose.js";
import { SleepVsStepsRule } from "../rules/sleepVsSteps.js";
import { SleepVsSpendingRule } from "../rules/sleepVsSpending.js";
import { CaffeineVsSleepRule } from "../rules/caffeineVsSleep.js";
import { AlcoholVsSleepRule } from "../rules/alcoholVsSleep.js";
import { AlcoholVsMoodRule } from "../rules/alcoholVsMood.js";
import { CaffeineVsGlucoseRule } from "../rules/caffeineVsGlucose.js";
import { ExerciseVsMoodRule } from "../rules/exerciseVsMood.js";
import { StepsVsMoodRule } from "../rules/stepsVsMood.js";
import { WaterVsMoodRule } from "../rules/waterVsMood.js";
import { MealSkippingVsMoodRule } from "../rules/mealSkippingVsMood.js";
import { LateMealsVsSleepRule } from "../rules/lateMealsVsSleep.js";
import { RestingHRVsExerciseRule } from "../rules/restingHRVsExercise.js";
import { HobbiesVsSpendingRule } from "../rules/hobbiesVsSpending.js";
import { GlucoseVariabilityRule } from "../rules/glucoseVariability.js";
import { MoodJournalingStreakRule } from "../rules/moodJournalingStreak.js";
import { MindfulnessVsMoodRule } from "../rules/mindfulnessVsMood.js";
import { MindfulnessVsGlucoseRule } from "../rules/mindfulnessVsGlucose.js";
import { MindfulnessVsRestingHRRule } from "../rules/mindfulnessVsRestingHR.js";
import { MindfulnessVsSpendingRule } from "../rules/mindfulnessVsSpending.js";
import { TriSleepStepsMoodRule } from "../rules/triSleepStepsMood.js";
import { TriSleepExerciseGlucoseRule } from "../rules/triSleepExerciseGlucose.js";
import { TriCaffeineStepsSleepRule } from "../rules/triCaffeineStepsSleep.js";
import { TriStepsWaterMoodRule } from "../rules/triStepsWaterMood.js";
import { ChainSleepMoodSpendingRule } from "../rules/chainSleepMoodSpending.js";
import { QuadSleepStepsWaterMoodRule } from "../rules/quadSleepStepsWaterMood.js";
import { ChainSleepExerciseMoodSpendingRule } from "../rules/chainSleepExerciseMoodSpending.js";
import { QuadGlucoseSleepMoodStepsRule } from "../rules/quadGlucoseSleepMoodSteps.js";
import { QuintAllMetricsRule } from "../rules/quintAllMetrics.js";
import { QuadCaffeineSleepMoodStepsRule } from "../rules/quadCaffeineSleepMoodSteps.js";
// Composite "best days" rule — reverse-engineers what behaviors correlate with top-20% days
import { BestDaysCommonRule } from "../rules/bestDaysCommon.js";
// Phase-4 net-new rules using previously untapped data
import { StressVsSpendingRule } from "../rules/stressVsSpending.js";
import { WeatherVsMoodRule } from "../rules/weatherVsMood.js";
import { WeatherVsExerciseRule } from "../rules/weatherVsExercise.js";
import { MealSizeVsSleepRule } from "../rules/mealSizeVsSleep.js";
import { AlcoholQuantityVsGlucoseRule } from "../rules/alcoholQuantityVsGlucose.js";
import { SymptomClustersRule } from "../rules/symptomClusters.js";
import { MuscleGroupRotationRule } from "../rules/muscleGroupRotation.js";
import { SpendingCategoryVsMoodRule } from "../rules/spendingCategoryVsMood.js";
import { TimeOfDayMoodRule } from "../rules/timeOfDayMood.js";
import { TimeOfDaySpendRule } from "../rules/timeOfDaySpend.js";
import { HrvVsSleepRule } from "../rules/hrvVsSleep.js";
import { ScreenTimeVsSleepRule } from "../rules/screenTimeVsSleep.js";
// Trend rules — recent 30d vs prior 30d
import { TrendRestingHRRule } from "../rules/trendRestingHR.js";
import { TrendSleepDurationRule } from "../rules/trendSleepDuration.js";
import { TrendGlucoseVariabilityRule } from "../rules/trendGlucoseVariability.js";
import { TrendStepsRule } from "../rules/trendSteps.js";
import { TrendMoodRule } from "../rules/trendMood.js";
// Phase-5 engine upgrade — new signal categories built on day-frame + stats
import { AnomalyDailyRule } from "../rules/anomalyDaily.js";
import { StreakBrokenRule } from "../rules/streakBroken.js";
import { ForecastNextDayRule } from "../rules/forecastNextDay.js";
import { RecoveryScoreRule } from "../rules/recoveryScore.js";
import { MetabolicScoreRule } from "../rules/metabolicScore.js";
import { WeeklyRhythmMoodRule, WeeklyRhythmSpendRule } from "../rules/weeklyRhythm.js";
import { LagSleepGlucoseRule } from "../rules/lagSleepGlucose.js";
import { ChangePointRule } from "../rules/changePoint.js";
import { CaffeineDoseRule } from "../rules/caffeineDose.js";
import { HabitClustersRule } from "../rules/habitClusters.js";
import { WorstDaysCommonRule } from "../rules/worstDaysCommon.js";
import { MealCompositionRule } from "../rules/mealComposition.js";
import { SleepArchitectureRule } from "../rules/sleepArchitecture.js";
import { RecoveryDayRule } from "../rules/recoveryDay.js";
import { SymptomLagTriggerRule } from "../rules/symptomLagTrigger.js";
import { SeasonalYoYRule } from "../rules/seasonalYoY.js";
// Wave 2 — new signal categories
import { CyclePhaseRule } from "../rules/cyclePhase.js";
import { MedicationAdherenceOutcomesRule } from "../rules/medicationAdherenceOutcomes.js";
import { GlucoseOvernightRule } from "../rules/glucoseOvernight.js";
// Wave 3 — weather integration
import { WeatherRainActivityRule } from "../rules/weatherRainActivity.js";
import { WeatherTempSleepRule } from "../rules/weatherTempSleep.js";
import { WeatherDaylightMoodRule } from "../rules/weatherDaylightMood.js";
// Wave 3 — cross-metric
import { BestDayRecipeRule } from "../rules/bestDayRecipe.js";
import { SleepExerciseInteractionRule } from "../rules/sleepExerciseInteraction.js";
import { MealTimingSleepRule } from "../rules/mealTimingSleep.js";

// Registry — add new rules here, nothing else changes
export const ALL_RULES: InsightRule[] = [
  SleepVsMoodRule,
  ActivityVsGlucoseRule,
  ReadingVsMoodRule,
  HobbyVsMoodRule,
  WaterConsistencyRule,
  WeekendSpendingRule,
  MealGlucoseTypeRule,
  GlucoseTimeOfDayRule,
  SpendingVsMoodRule,
  MealStreakRule,
  WaterStreakRule,
  StepGoalStreakRule,
  MedicationAdherenceRule,
  MissedSlotRule,
  ExerciseConsistencyRule,
  UndertrainedMuscleRule,
  ExerciseCycleCorrelationRule,
  MedicationGlucoseCorrelationRule,
  SpendingVsExerciseRule,
  SpendingVsGlucoseRule,
  SpendingCyclePhaseRule,
  CycleVsSleepRule,
  CycleVsMoodRule,
  CycleVsGlucoseRule,
  MedicationVsMoodRule,
  MoodVariabilityRule,
  SleepConsistencyRule,
  SleepVsGlucoseRule,
  SleepVsStepsRule,
  SleepVsSpendingRule,
  CaffeineVsSleepRule,
  AlcoholVsSleepRule,
  AlcoholVsMoodRule,
  CaffeineVsGlucoseRule,
  ExerciseVsMoodRule,
  StepsVsMoodRule,
  WaterVsMoodRule,
  MealSkippingVsMoodRule,
  LateMealsVsSleepRule,
  RestingHRVsExerciseRule,
  HobbiesVsSpendingRule,
  GlucoseVariabilityRule,
  MoodJournalingStreakRule,
  MindfulnessVsMoodRule,
  MindfulnessVsGlucoseRule,
  MindfulnessVsRestingHRRule,
  MindfulnessVsSpendingRule,
  // Multi-metric (3+ variable) rules
  TriSleepStepsMoodRule,
  TriSleepExerciseGlucoseRule,
  TriCaffeineStepsSleepRule,
  TriStepsWaterMoodRule,
  ChainSleepMoodSpendingRule,
  // 4–5 metric rules
  QuadSleepStepsWaterMoodRule,
  ChainSleepExerciseMoodSpendingRule,
  QuadGlucoseSleepMoodStepsRule,
  QuintAllMetricsRule,
  QuadCaffeineSleepMoodStepsRule,
  BestDaysCommonRule,
  // Phase-4 net-new rules
  StressVsSpendingRule,
  WeatherVsMoodRule,
  WeatherVsExerciseRule,
  MealSizeVsSleepRule,
  AlcoholQuantityVsGlucoseRule,
  SymptomClustersRule,
  MuscleGroupRotationRule,
  SpendingCategoryVsMoodRule,
  TimeOfDayMoodRule,
  TimeOfDaySpendRule,
  HrvVsSleepRule,
  ScreenTimeVsSleepRule,
  // Trend rules
  TrendRestingHRRule,
  TrendSleepDurationRule,
  TrendGlucoseVariabilityRule,
  TrendStepsRule,
  TrendMoodRule,
  // Phase-5 upgrade rules
  AnomalyDailyRule,
  StreakBrokenRule,
  ForecastNextDayRule,
  RecoveryScoreRule,
  MetabolicScoreRule,
  WeeklyRhythmMoodRule,
  WeeklyRhythmSpendRule,
  LagSleepGlucoseRule,
  ChangePointRule,
  CaffeineDoseRule,
  HabitClustersRule,
  WorstDaysCommonRule,
  MealCompositionRule,
  SleepArchitectureRule,
  RecoveryDayRule,
  SymptomLagTriggerRule,
  SeasonalYoYRule,
  // Wave 2 — new signal categories
  CyclePhaseRule,
  MedicationAdherenceOutcomesRule,
  GlucoseOvernightRule,
  // Wave 3 — weather integration
  WeatherRainActivityRule,
  WeatherTempSleepRule,
  WeatherDaylightMoodRule,
  // Wave 3 — cross-metric
  BestDayRecipeRule,
  SleepExerciseInteractionRule,
  MealTimingSleepRule,
];

export interface StoredInsight {
  id: string;
  user_id: string;
  rule_id: string;
  type: string;
  title: string;
  description: string;
  confidence: string;
  confidence_score: number;
  supporting_data: Record<string, unknown>;
  first_detected: string;
  last_confirmed: string;
  times_observed: number;
  status: string;
  dismissed: boolean;
  created_at: string;
  updated_at: string;
}

async function upsertInsight(userId: string, ruleId: string, type: string, result: InsightResult, extras: {
  ruleVersion?: number;
  actionable?: boolean;
  clinicalRisk?: boolean;
  primaryMetric?: string;
}): Promise<void> {
  const enrichedSupport = {
    ...result.supportingData,
    ...(result.pValue     != null ? { p_value:     result.pValue     } : {}),
    ...(result.effectSize != null ? { effect_size: result.effectSize } : {}),
    ...(result.ci95       != null ? { ci95:        result.ci95       } : {}),
    ...(extras.ruleVersion     != null ? { rule_version:     extras.ruleVersion     } : {}),
    ...(extras.actionable      != null ? { actionable:       extras.actionable      } : {}),
    ...(extras.clinicalRisk    != null ? { clinical_risk:    extras.clinicalRisk    } : {}),
    ...(extras.primaryMetric   != null ? { primary_metric:   extras.primaryMetric   } : {}),
  };
  await query(
    `INSERT INTO user_insights
       (user_id, rule_id, type, title, description, confidence, confidence_score,
        supporting_data, last_confirmed, times_observed, status, dismissed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, 'active', FALSE)
     ON CONFLICT (user_id, rule_id) DO UPDATE SET
       title            = EXCLUDED.title,
       description      = EXCLUDED.description,
       confidence       = EXCLUDED.confidence,
       confidence_score = EXCLUDED.confidence_score,
       supporting_data  = EXCLUDED.supporting_data,
       last_confirmed   = NOW(),
       times_observed   = EXCLUDED.times_observed,
       status           = 'active',
       updated_at       = NOW()`,
    [userId, ruleId, type, result.title, result.description,
     result.confidence, result.confidenceScore,
     JSON.stringify(enrichedSupport), result.timesObserved]
  );
}

/**
 * Which tier fires on this run.
 *   daily      -> every night
 *   semiweekly -> Mon + Thu (day-of-week 1 or 4)
 *   weekly     -> Sun (day-of-week 0)
 * A per-rule tier is skipped when its tier doesn't match the current day.
 */
function tierRunsToday(tier: RuleTier, now: Date, force: boolean): boolean {
  if (force) return true;
  if (tier === "daily") return true;
  const dow = estDayOfWeek(now);
  if (tier === "semiweekly") return dow === 1 || dow === 4;
  if (tier === "weekly") return dow === 0;
  return true;
}

async function markStale(userId: string, activeRuleIds: string[]): Promise<void> {
  if (activeRuleIds.length === 0) {
    await query(
      `UPDATE user_insights SET status = 'stale', updated_at = NOW()
       WHERE user_id = $1 AND dismissed = FALSE AND status = 'active'`,
      [userId]
    );
    return;
  }
  await query(
    `UPDATE user_insights SET status = 'stale', updated_at = NOW()
     WHERE user_id = $1
       AND dismissed = FALSE
       AND status = 'active'
       AND rule_id NOT IN (${activeRuleIds.map((_, i) => `$${i + 2}`).join(",")})`,
    [userId, ...activeRuleIds]
  );
}

// Domain → InsightRule.type values that belong to it.
const DOMAIN_TYPES: Record<string, string[]> = {
  sleep:    ["sleep"],
  mood:     ["mood", "journaling"],
  glucose:  ["glucose"],
  spending: ["spending"],
};

async function emitCategorySummaries(
  userId: string,
  surviving: Array<{ rule: InsightRule; result: InsightResult }>,
): Promise<void> {
  for (const [domain, types] of Object.entries(DOMAIN_TYPES)) {
    const group = surviving.filter(c => types.includes(c.rule.type));
    if (group.length < 2) continue;

    // Build a 1-2 sentence synthesis from the top-2 insights in this domain.
    const top = group.slice(0, 2);
    const sentences = top.map(c => c.result.description.split(".")[0]).join(". ");
    const title = `Your ${domain} patterns at a glance`;
    const description = `${sentences}. (Synthesized from ${group.length} active ${domain} insights.)`;

    // Merge supporting_data from the group.
    const mergedData: Record<string, unknown> = {};
    for (const c of group) {
      for (const [k, v] of Object.entries(c.result.supportingData ?? {})) {
        mergedData[`${c.rule.id}__${k}`] = v;
      }
    }
    mergedData.domain = domain;
    mergedData.source_rule_ids = group.map(c => c.rule.id);

    await query(
      `INSERT INTO user_insights
         (user_id, rule_id, type, title, description, confidence, confidence_score,
          supporting_data, last_confirmed, times_observed, status, dismissed)
       VALUES ($1, $2, 'category_summary', $3, $4, 'moderate', 50, $5::jsonb, NOW(), $6, 'active', FALSE)
       ON CONFLICT (user_id, rule_id) DO UPDATE SET
         title            = EXCLUDED.title,
         description      = EXCLUDED.description,
         supporting_data  = EXCLUDED.supporting_data,
         last_confirmed   = NOW(),
         times_observed   = EXCLUDED.times_observed,
         status           = 'active',
         updated_at       = NOW()`,
      [userId, `category_summary_${domain}`, title, description, JSON.stringify(mergedData), group.length]
    );
  }
}

// Run all rules for one user and upsert results.
// Options:
//   force = true bypasses tier scheduling (e.g. manual /regenerate)
export async function runInsightsForUser(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<{ ran: number; found: number; skipped: number; errors: string[]; runMs: number }> {
  const runStart = Date.now();
  const errors: string[] = [];
  const foundRuleIds: string[] = [];
  let skipped = 0;

  const [userRow] = await query<{ created_at: string }>(`SELECT created_at FROM users WHERE id = $1`, [userId]);
  const accountAgeDays = userRow
    ? (Date.now() - new Date(userRow.created_at).getTime()) / (1000 * 86400)
    : 0;

  const now = new Date();
  const archived = await archivedRuleIds().catch(() => new Set<string>());

  // Incremental recomputation: check the per-user watermark.
  // When no new data has arrived in the last 3 days, skip semiweekly/weekly rules.
  let skipHeavyTiers = false;
  if (!opts.force) {
    try {
      const [watermark] = await query<{ latest_frame_date: string }>(
        `SELECT latest_frame_date::text FROM insight_engine_state WHERE user_id = $1`,
        [userId]
      );
      if (watermark) {
        const daysSinceNew = (now.getTime() - new Date(watermark.latest_frame_date + "T00:00:00Z").getTime()) / 86400000;
        if (daysSinceNew >= 3) skipHeavyTiers = true;
      }
    } catch { /* table may not exist yet — proceed normally */ }
  }

  const eligibleRules = ALL_RULES.filter(rule => {
    if (archived.has(rule.id)) return false;
    if (rule.minDays && accountAgeDays < rule.minDays) return false;
    const tier: RuleTier = rule.tier ?? "semiweekly";
    if (skipHeavyTiers && (tier === "semiweekly" || tier === "weekly")) return false;
    return tierRunsToday(tier, now, !!opts.force);
  });
  skipped = ALL_RULES.length - eligibleRules.length;

  // Pre-flight: fetch a single capability summary so rules can skip DB queries
  // when the user doesn't have the required data types.
  const [caps] = await query<{
    has_substances: boolean;
    has_cycle: boolean;
    has_hr: boolean;
    has_glucose: boolean;
    has_medications: boolean;
    medication_slots_count: string;
  }>(
    `SELECT
       EXISTS(SELECT 1 FROM substance_logs WHERE user_id=$1 LIMIT 1)           AS has_substances,
       EXISTS(SELECT 1 FROM cycle_day_logs  WHERE user_id=$1 LIMIT 1)          AS has_cycle,
       EXISTS(SELECT 1 FROM heart_rate_readings WHERE user_id=$1 LIMIT 1)      AS has_hr,
       EXISTS(SELECT 1 FROM glucose_readings WHERE user_id=$1 LIMIT 1)         AS has_glucose,
       EXISTS(SELECT 1 FROM medications WHERE user_id=$1 AND active=true LIMIT 1) AS has_medications,
       (SELECT COUNT(*) FROM medication_schedule_slots mss
        JOIN medications m ON m.id = mss.medication_id
        WHERE m.user_id=$1 AND m.active=true)                                  AS medication_slots_count`,
    [userId]
  );

  const capabilities: UserCapabilities = {
    has_substances:         caps?.has_substances         ?? false,
    has_cycle:              caps?.has_cycle              ?? false,
    has_hr:                 caps?.has_hr                 ?? false,
    has_glucose:            caps?.has_glucose            ?? false,
    has_medications:        caps?.has_medications        ?? false,
    medication_slots_count: parseInt(caps?.medication_slots_count ?? "0"),
  };

  // Build the day-frame ONCE for this user — new-style rules read from it
  // instead of re-issuing overlapping queries.
  const frame = await buildDayFrame(userId, 120);

  // Only mark stale AFTER we've collected candidates. This prevents a crash
  // mid-run from wiping active insights. We use a "pending" bag + final
  // atomic swap semantics via `markStale(userId, foundRuleIds)`.
  type Candidate = {
    rule: InsightRule;
    result: InsightResult;
    runtimeMs: number;
  };
  const candidates: Candidate[] = [];

  // Per-rule timeout — a rule that hangs on a bad query no longer holds
  // its user's whole engine run indefinitely. 30s is generous for the
  // heaviest legacy correlational rules.
  const RULE_TIMEOUT_MS = 30_000;

  // Tracks all evaluated rules for fired=false rows (including null returns).
  type EvalRecord = { rule: InsightRule; fired: boolean; runtimeMs: number };
  const evalRecords: EvalRecord[] = [];

  // Warn once per run (not per user) about MDE rules missing a "difference" key.
  const mdeKeyMissingWarned = new Set<string>();

  await Promise.allSettled(
    eligibleRules.map(async (rule) => {
      const t0 = Date.now();
      try {
        const invoke = async (): Promise<InsightResult | null> => {
          if (typeof rule.runWithContext === "function") {
            return rule.runWithContext({
              userId,
              capabilities,
              frame,
              currentTier: rule.tier ?? "semiweekly",
              now,
            });
          }
          return rule.run(userId, capabilities);
        };

        const timeout = new Promise<InsightResult | null>((_, reject) =>
          setTimeout(() => reject(new Error(`rule ${rule.id} timed out after ${RULE_TIMEOUT_MS}ms`)), RULE_TIMEOUT_MS)
        );

        const result = await Promise.race([invoke(), timeout]);
        if (!result) {
          evalRecords.push({ rule, fired: false, runtimeMs: Date.now() - t0 });
          return;
        }

        // MDE gate — if the rule declared a primary metric and reports an
        // effect that doesn't cross the minimum-detectable threshold, drop it.
        // (Rank-biserial effect sizes are intentionally exempt — the MDE
        // table is in native units, not correlation coefficients.)
        const metric = rule.primaryMetric ?? result.primaryMetric;
        if (metric && MDE[metric] != null && result.supportingData) {
          const diffKey = Object.keys(result.supportingData).find(k => /difference/i.test(k));
          if (!diffKey && !mdeKeyMissingWarned.has(rule.id)) {
            mdeKeyMissingWarned.add(rule.id);
            console.warn(
              `[insightsEngine] MDE gate: rule "${rule.id}" has primaryMetric "${metric}" with an MDE threshold but supportingData contains no key matching /difference/i — gate skipped for this rule`
            );
          }
          if (diffKey) {
            const rawDiff = Number((result.supportingData as any)[diffKey]);
            if (Number.isFinite(rawDiff) && !passesMDE(metric, Math.abs(rawDiff))) {
              evalRecords.push({ rule, fired: false, runtimeMs: Date.now() - t0 });
              return;
            }
          }
        }

        candidates.push({ rule, result, runtimeMs: Date.now() - t0 });
        evalRecords.push({ rule, fired: true, runtimeMs: Date.now() - t0 });
      } catch (err: any) {
        errors.push(`${rule.id}: ${err?.message ?? "unknown error"}`);
        evalRecords.push({ rule, fired: false, runtimeMs: Date.now() - t0 });
      }
    })
  );

  // Multiple-comparison correction across every candidate that supplied a
  // p-value. Candidates without a p-value pass through untouched (streaks,
  // trends, adherence, etc. are descriptive, not hypothesis tests).
  const withP = candidates.filter(c => c.result.pValue != null);
  if (withP.length > 0) {
    const passes = benjaminiHochberg(withP.map(c => c.result.pValue!), 0.10);
    for (let i = 0; i < withP.length; i++) {
      if (!passes[i]) {
        (withP[i].result as any).__fdrRejected = true;
      }
    }
  }
  const surviving = candidates.filter(c => !(c.result as any).__fdrRejected);

  // Now do the atomic swap: mark stale + upsert survivors + log stats.
  await markStale(userId, surviving.map(c => c.rule.id));
  await Promise.all(surviving.map(c => upsertInsight(userId, c.rule.id, c.rule.type, c.result, {
    ruleVersion:    c.rule.version,
    actionable:     c.rule.actionable ?? c.result.actionable,
    clinicalRisk:   c.rule.clinicalRisk ?? c.result.clinicalRisk,
    primaryMetric:  c.rule.primaryMetric ?? c.result.primaryMetric,
  })));
  foundRuleIds.push(...surviving.map(c => c.rule.id));

  // Observability — one row per evaluated rule per run, non-blocking.
  // fired=TRUE means the rule returned a non-null result that passed all gates
  // (MDE + FDR). fired=FALSE means the rule ran but produced no insight this
  // cycle (null return, MDE gate failure, or uncaught error). This lets us
  // compute accurate per-rule hit rates as SUM(fired)/COUNT(*).
  // Table uses a BIGSERIAL PK (see migration 034), so every insert is a new
  // row — no conflicts to swallow. If an insert genuinely errors we log it
  // once instead of hiding it silently.
  Promise.all(
    evalRecords.map(e => {
      // A candidate is "fired" only if it survived FDR correction too.
      const candidate = candidates.find(c => c.rule.id === e.rule.id);
      const actuallyFired = e.fired && !!candidate && !(candidate.result as any).__fdrRejected;
      const fdrRejected   = e.fired && !!candidate && !!(candidate.result as any).__fdrRejected;
      return query(
        `INSERT INTO insight_rule_runs (user_id, rule_id, rule_version, tier, runtime_ms, fired, fdr_rejected)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, e.rule.id, e.rule.version ?? 1, e.rule.tier ?? "semiweekly", e.runtimeMs, actuallyFired, fdrRejected]
      ).catch((err) => {
        console.warn(`[insightsEngine] insight_rule_runs insert failed for rule ${e.rule.id}:`, err?.message);
      });
    })
  ).catch(() => {});

  // Category meta-summaries: when 2+ active insights exist per domain, emit
  // a lightweight synthesis card (type = "category_summary").
  try {
    await emitCategorySummaries(userId, surviving);
  } catch (err: any) {
    errors.push(`category_summary: ${err?.message ?? "unknown"}`);
  }

  // Post-run: dedup near-duplicates then rank + persist rank_score.
  try {
    await dedupInsights(userId);
    await rankAndPersist(userId);
  } catch (err: any) {
    errors.push(`rank/dedup: ${err?.message ?? "unknown"}`);
  }

  // Persist watermark: latest frame date for incremental recomputation.
  if (frame.rows.length > 0) {
    const latestDate = frame.rows[frame.rows.length - 1].date;
    query(
      `INSERT INTO insight_engine_state (user_id, latest_frame_date, last_run_at, updated_at)
       VALUES ($1, $2::date, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         latest_frame_date = GREATEST(insight_engine_state.latest_frame_date, EXCLUDED.latest_frame_date),
         last_run_at       = NOW(),
         updated_at        = NOW()`,
      [userId, latestDate]
    ).catch(() => {}); // non-blocking
  }

  return {
    ran: eligibleRules.length,
    found: foundRuleIds.length,
    skipped,
    errors,
    runMs: Date.now() - runStart,
  };
}

export async function getActiveInsights(userId: string): Promise<StoredInsight[]> {
  return query<StoredInsight>(
    `SELECT id, user_id, rule_id, type, title, description, confidence, confidence_score,
            supporting_data, first_detected, last_confirmed, times_observed, status,
            dismissed, created_at, updated_at
     FROM user_insights
     WHERE user_id = $1
       AND dismissed = FALSE
       AND (snoozed_until IS NULL OR snoozed_until <= NOW())
       AND status = 'active'
       AND NOT (supporting_data ? 'duplicate_of')
     ORDER BY pinned DESC NULLS LAST,
              COALESCE(rank_score, confidence_score / 100.0) DESC,
              last_confirmed DESC
     LIMIT 50`,
    [userId]
  );
}

export async function getInsightHistory(userId: string): Promise<StoredInsight[]> {
  return query<StoredInsight>(
    `SELECT id, user_id, rule_id, type, title, description, confidence, confidence_score,
            supporting_data, first_detected, last_confirmed, times_observed, status,
            dismissed, created_at, updated_at
     FROM user_insights
     WHERE user_id = $1
     ORDER BY last_confirmed DESC
     LIMIT 100`,
    [userId]
  );
}
