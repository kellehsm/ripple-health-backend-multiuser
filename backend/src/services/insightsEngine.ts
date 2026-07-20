import { query } from "../db.js";
import type { InsightRule, InsightResult } from "../rules/types.js";
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

async function upsertInsight(userId: string, ruleId: string, type: string, result: InsightResult): Promise<void> {
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
     JSON.stringify(result.supportingData), result.timesObserved]
  );
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

// Run all rules for one user and upsert results
export async function runInsightsForUser(userId: string): Promise<{ ran: number; found: number; errors: string[] }> {
  const errors: string[] = [];
  const foundRuleIds: string[] = [];

  const [userRow] = await query<{ created_at: string }>(`SELECT created_at FROM users WHERE id = $1`, [userId]);
  const accountAgeDays = userRow
    ? (Date.now() - new Date(userRow.created_at).getTime()) / (1000 * 86400)
    : 0;

  const eligibleRules = ALL_RULES.filter(rule => !rule.minDays || accountAgeDays >= rule.minDays);

  await Promise.allSettled(
    eligibleRules.map(async (rule) => {
      try {
        const result = await rule.run(userId);
        if (result) {
          await upsertInsight(userId, rule.id, rule.type, result);
          foundRuleIds.push(rule.id);
        }
      } catch (err: any) {
        errors.push(`${rule.id}: ${err?.message ?? "unknown error"}`);
      }
    })
  );

  await markStale(userId, foundRuleIds);

  return { ran: eligibleRules.length, found: foundRuleIds.length, errors };
}

export async function getActiveInsights(userId: string): Promise<StoredInsight[]> {
  return query<StoredInsight>(
    `SELECT * FROM user_insights
     WHERE user_id = $1 AND dismissed = FALSE AND status = 'active'
     ORDER BY confidence_score DESC, last_confirmed DESC`,
    [userId]
  );
}

export async function getInsightHistory(userId: string): Promise<StoredInsight[]> {
  return query<StoredInsight>(
    `SELECT * FROM user_insights
     WHERE user_id = $1
     ORDER BY last_confirmed DESC
     LIMIT 100`,
    [userId]
  );
}
