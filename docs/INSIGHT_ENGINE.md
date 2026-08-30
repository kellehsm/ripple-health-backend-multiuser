# Insight Engine — Living Reference & Roadmap

> Living document — update the rule catalog and roadmap whenever insight rules change.
> Supersedes `INSIGHT_ENGINE_UPGRADES.md` (archived; all shipped items moved to §Shipped below).

---

## 1. Overview

The insight engine runs statistical rules over each user's logged data and writes
personalized pattern cards ("insights") to the `user_insights` table.

**When it runs**
- Nightly at 3 AM EST via cron (`insightsJob.ts` → `runInsightsForUser`)
- On server startup (one-shot run to catch any missed night)
- On demand via `POST /insights/regenerate` (force-mode, bypasses tier scheduling)

**What runs before the rules**
1. `refreshAllBaselines` — per-user tertile / trend baselines refreshed so comparisons
   are against fresh distributions.
2. Pre-flight capability query — one DB round-trip checks whether the user has
   substances, cycle logs, HR, glucose, or active medications. Rules that need missing
   data skip immediately without issuing queries.
3. `buildDayFrame(userId, 120)` — 120-day rolling snapshot shared across all
   context-aware rules (avoids N×rule redundant queries).

**Where results land**
| Table | Purpose |
|---|---|
| `user_insights` | One row per (user, rule); upserted each run |
| `insight_rule_runs` | Observability: runtime, `fired` (boolean), FDR-rejected per rule per run — **every evaluated rule** gets a row (fired=TRUE or fired=FALSE); hit rate = `SUM(fired::int)/COUNT(*)` |
| `insight_engine_state` | Per-user watermark (`latest_frame_date`) for incremental skipping |
| `insight_feedback` | User ratings (helpful / neutral / not_useful / already_knew) |
| `user_rule_weights` | Per-user rule weight adjusted from feedback |
| `insight_global_priors` | Cross-user hit-rate priors for cold-start ranking |
| `insight_experiment_results` | Outcome measurements from seeded experiments |
| `monthly_narratives` | Cached LLM-generated monthly narrative (see §LLM below) |

**Screens that consume insights**
- `InsightsScreen` — active insight cards with sparklines, confidence badges, dismiss/snooze/pin
- `InsightTimelineScreen` — full lifecycle history
- Monthly summary / digest card (top-ranked insight + micro-nudge via `/insights/digest`)

---

## 2. Architecture

### Rule pipeline (per user, per night)

```
refreshAllBaselines
  → capability pre-flight
  → buildDayFrame (120d)
  → filter ALL_RULES by: archived? minDays? tier? skipHeavyTiers?
  → run eligible rules in parallel (30s per-rule timeout)
  → Benjamini-Hochberg FDR correction across rules with p-values (q ≤ 0.10)
  → MDE gate (drop rules whose primary-metric diff < minimum detectable effect)
  → markStale (rules that didn't fire)
  → upsertInsight survivors
  → emitCategorySummaries (2+ active rules per domain → synthesis card)
  → dedupInsights (cluster near-duplicates by primary_metric + direction)
  → rankAndPersist (conf × novelty × actionable × affinity × decay → rank_score)
  → persist watermark
  → processEndedExperiments / computeGlobalPriors / sunsetLowHitRules (housekeeping)
```

### Rule definition

Each rule is a TypeScript object satisfying `InsightRule` (`backend/src/rules/types.ts`):

```ts
interface InsightRule {
  readonly id: string;          // snake_case, unique
  readonly type: string;        // e.g. "sleep", "mood", "glucose"
  readonly minDays: number;     // account age gate
  readonly version?: number;    // bump on algorithm changes
  readonly tier?: RuleTier;     // "daily" | "semiweekly" | "weekly" (default: semiweekly)
  readonly actionable?: boolean;
  readonly clinicalRisk?: boolean;
  readonly primaryMetric?: string;
  run(userId, capabilities?): Promise<InsightResult | null>;
  runWithContext?(ctx): Promise<InsightResult | null>;  // preferred; reads from frame
}
```

Rules return `null` to pass silently (insufficient data, no pattern found).

### Scheduling tiers

| Tier | Days run | Typical use |
|---|---|---|
| `daily` | Every night | Anomaly, streak, forecast rules |
| `semiweekly` | Mon + Thu | Most correlation rules |
| `weekly` | Sun only | Heavy seasonal / year-on-year rules |

Incremental optimisation: if `insight_engine_state.latest_frame_date` is ≥3 days old
(no new data), semiweekly and weekly rules are skipped entirely.

### Statistical safeguards

- **Welch's t-test + Mann-Whitney U** — helpers in `backend/src/rules/stats.ts`
- **Benjamini-Hochberg FDR** at q=0.10 across all candidates with p-values per run
- **MDE gates** — per-metric minimum detectable effect table in `stats.ts`; a
  reported difference below the threshold is silently dropped; the engine logs a
  `warn` when a rule with an MDE threshold lacks a `/difference/i` key in
  `supportingData` (indicates missing MDE-check wiring)
- **Bootstrap CIs** — `bootstrapMeanDiffCI` for small-sample rules
- **Autocorrelation-adjusted effective N** — `effectiveSampleSize` / `lag1Autocorr`
- **Winsorization** at p2/p98 on baselines
- **Confounder residualization**, **Granger-style lift**, **change-point detection**,
  **dose-response inflection** — in `backend/src/services/causality.ts`

### Ranking & lifecycle

`insightRanker.rankAndPersist` computes `rank_score = confidence × novelty × actionable
× affinity × decay` and writes it to `user_insights.rank_score`. Insights not engaged
in 21 days accumulate a decay factor. `dedupInsights` clusters near-duplicates and hides
them via `supporting_data.duplicate_of`. Flip/weakening detection emits a "no longer
predicts" insight when a rule reverses direction.

### LLM monthly narrative

`backend/src/services/monthlyNarrative.ts` generates a ~150-word friendly narrative per
calendar month using `claude-sonnet-4-6` (Anthropic SDK). Generated on-demand on first
request; cached in `monthly_narratives`. Never called from the nightly job.

### Key file paths

| File | Role |
|---|---|
| `backend/src/jobs/insightsJob.ts` | Entry point; advisory lock; orchestrates the run |
| `backend/src/services/insightsEngine.ts` | `ALL_RULES` registry; `runInsightsForUser` |
| `backend/src/rules/types.ts` | `InsightRule` / `InsightResult` interfaces |
| `backend/src/rules/stats.ts` | Welch, MWU, BH, MDE table, bootstrap, winsorize |
| `backend/src/services/causality.ts` | Pearson, Granger, change-point, dose-response |
| `backend/src/services/dayFrame.ts` | `buildDayFrame` — shared 120-day snapshot |
| `backend/src/services/insightRanker.ts` | `rankAndPersist`, `dedupInsights`, flip detection |
| `backend/src/services/baselines.ts` | `refreshAllBaselines` |
| `backend/src/services/ruleSunset.ts` | `sunsetLowHitRules` — archives low-signal rules; hit rate computed as `SUM(fired)/COUNT(*)` across all evaluated rows (not just fired rows) |
| `backend/src/services/globalPriors.ts` | `computeGlobalPriors` — cross-user cold-start |
| `backend/src/services/monthlyNarrative.ts` | LLM narrative generation + caching |
| `backend/src/routes/insights.ts` | REST endpoints (see below) |
| `backend/scripts/insight-golden-set.mjs` | Golden-set regression runner |
| `backend/scripts/insight-golden-set.impl.ts` | 77 assertions over stats helpers |
| `backend/scripts/lint-insight-language.mjs` | Diagnostic-language CI linter |

### REST endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/insights` | Active, undismissed insights (suppresses rules downvoted ≥3×) |
| GET | `/insights/history` | All insights including stale/dismissed |
| GET | `/insights/timeline` | Lifecycle events newest-first |
| GET | `/insights/digest` | Top-ranked insight + one micro-nudge |
| GET | `/insights/impact/:rule_id` | Cross-user average outcome (min 5 samples) |
| GET | `/insights/:id/debug` | Explainability dump: rule runs, feedback, weight |
| POST | `/insights/regenerate` | Force-run engine for this user |
| POST | `/insights/:id/dismiss` | Dismiss an insight |
| POST | `/insights/:id/undismiss` | Restore dismissed insight |
| POST | `/insights/:id/snooze` | Hide for N days (default 7, max 90) |
| POST | `/insights/:id/pin` | Toggle bookmark |
| POST | `/insights/:id/feedback` | Rate insight; adjusts per-rule weight immediately |
| POST | `/insights/:id/explain` | LLM-friendly payload for client-side explanation |
| POST | `/insights/:id/try` | Seed a 14-21d experiment from rule template |

---

## 3. Rule Catalog

101 rules registered in `ALL_RULES`. Wave/phase noted where determinable from code comments.

| Rule class | Rule ID | Trigger (one line) | Primary data sources | Wave |
|---|---|---|---|---|
| SleepVsMoodRule | sleep_vs_mood | Poor sleep nights predict lower next-day mood | sleep_logs, mood_logs | Core |
| ActivityVsGlucoseRule | activity_vs_glucose | Active days have lower post-activity glucose | activity_logs, glucose_readings | Core |
| ReadingVsMoodRule | reading_vs_mood | Reading sessions correlate with mood lift | hobby_logs (reading), mood_logs | Core |
| HobbyVsMoodRule | hobby_vs_mood | Hobby time correlates with mood improvement | hobby_logs, mood_logs | Core |
| WaterConsistencyRule | water_consistency | Hydration consistency below target on most days | water_logs | Core |
| WeekendSpendingRule | weekend_spending | Weekend daily spend significantly exceeds weekday | transactions | Core |
| MealGlucoseTypeRule | meal_glucose_type | High-carb meals correlate with glucose spikes | meal_logs, glucose_readings | Core |
| GlucoseTimeOfDayRule | glucose_time_of_day | Glucose peaks cluster in a specific time window | glucose_readings | Core |
| SpendingVsMoodRule | spending_vs_mood | High-spend days correlate with mood change | transactions, mood_logs | Core |
| MealStreakRule | meal_logging_streak | Consecutive days hitting meal-log target | meal_logs | Core |
| WaterStreakRule | water_logging_streak | Consecutive days meeting hydration goal | water_logs | Core |
| StepGoalStreakRule | step_goal_streak | Consecutive days meeting step goal | activity_logs | Core |
| MedicationAdherenceRule | medication_adherence_weekly | Adherence rate below threshold over past 14d | medication_logs | Core |
| MissedSlotRule | missed_slot_pattern | Specific scheduled slot repeatedly missed | medication_schedule_slots, medication_logs | Core |
| ExerciseConsistencyRule | exercise_consistency_monthly | Exercise frequency trend vs prior period | exercise_logs | Core |
| UndertrainedMuscleRule | undertrained_muscle_group | A muscle group not worked in 7+ days | exercise_logs | Core |
| ExerciseCycleCorrelationRule | exercise_cycle_correlation | Exercise volume differs by cycle phase | exercise_logs, cycle_day_logs | Core |
| MedicationGlucoseCorrelationRule | medication_glucose_correlation | Medication-taken days have lower glucose | medication_logs, glucose_readings | Core |
| SpendingVsExerciseRule | spending_vs_exercise | High-exercise days have lower discretionary spend | exercise_logs, transactions | Core |
| SpendingVsGlucoseRule | spending_vs_glucose | High-spend days predict next-day glucose change | transactions, glucose_readings | Core |
| SpendingCyclePhaseRule | spending_cycle_phase | Spend differs significantly by cycle phase | transactions, cycle_day_logs | Core |
| CycleVsSleepRule | cycle_vs_sleep | Sleep duration or quality varies by cycle phase | cycle_day_logs, sleep_logs | Core |
| CycleVsMoodRule | cycle_vs_mood | Mood scores differ across cycle phases | cycle_day_logs, mood_logs | Core |
| CycleVsGlucoseRule | cycle_vs_glucose | Glucose level differs across cycle phases | cycle_day_logs, glucose_readings | Core |
| MedicationVsMoodRule | medication_vs_mood | Adherent days show mood difference | medication_logs, mood_logs | Core |
| MoodVariabilityRule | mood_variability | Mood variability (SD) elevated vs baseline | mood_logs | Core |
| SleepConsistencyRule | sleep_consistency | Bedtime or wake-time spread exceeds threshold | sleep_logs | Core |
| SleepVsGlucoseRule | sleep_vs_glucose | Short-sleep nights predict next-day glucose rise | sleep_logs, glucose_readings | Core |
| SleepVsStepsRule | sleep_vs_steps | Poor sleep nights precede lower step counts | sleep_logs, activity_logs | Core |
| SleepVsSpendingRule | sleep_vs_spending | Sleep quality correlates with next-day spend | sleep_logs, transactions | Core |
| CaffeineVsSleepRule | caffeine_vs_sleep | Late caffeine predicts shorter/later sleep | substance_logs (caffeine), sleep_logs | Core |
| AlcoholVsSleepRule | alcohol_vs_sleep | Alcohol on a night predicts worse sleep quality | substance_logs (alcohol), sleep_logs | Core |
| AlcoholVsMoodRule | alcohol_vs_mood | Alcohol days correlate with next-day mood drop | substance_logs (alcohol), mood_logs | Core |
| CaffeineVsGlucoseRule | caffeine_vs_glucose | Caffeine intake correlates with glucose elevation | substance_logs (caffeine), glucose_readings | Core |
| ExerciseVsMoodRule | exercise_vs_mood | Exercise days show mood lift vs rest days | exercise_logs, mood_logs | Core |
| StepsVsMoodRule | steps_vs_mood | High-step days correlate with better mood | activity_logs, mood_logs | Core |
| WaterVsMoodRule | water_vs_mood | Well-hydrated days show mood improvement | water_logs, mood_logs | Core |
| MealSkippingVsMoodRule | meal_skipping_vs_mood | Skipped-meal days predict lower mood | meal_logs, mood_logs | Core |
| LateMealsVsSleepRule | late_meals_vs_sleep | Late eating correlates with worse sleep onset | meal_logs, sleep_logs | Core |
| RestingHRVsExerciseRule | resting_hr_vs_exercise | Resting HR drops on exercise-rich weeks | heart_rate_readings, exercise_logs | Core |
| HobbiesVsSpendingRule | hobbies_vs_spending | High-hobby days have lower discretionary spend | hobby_logs, transactions | Core |
| GlucoseVariabilityRule | glucose_variability | Daily glucose CV% above healthy threshold | glucose_readings | Core |
| MoodJournalingStreakRule | mood_journaling_streak | Consecutive days with mood/journal entries | mood_logs | Core |
| MindfulnessVsMoodRule | mindfulness_vs_mood | Mindfulness sessions correlate with mood lift | mindfulness_logs, mood_logs | Core |
| MindfulnessVsGlucoseRule | mindfulness_vs_glucose | Mindfulness correlates with lower post-session glucose | mindfulness_logs, glucose_readings | Core |
| MindfulnessVsRestingHRRule | mindfulness_vs_resting_hr | Mindfulness sessions correlate with lower resting HR | mindfulness_logs, heart_rate_readings | Core |
| MindfulnessVsSpendingRule | mindfulness_vs_spending | Mindfulness days show lower discretionary spend | mindfulness_logs, transactions | Core |
| TriSleepStepsMoodRule | tri_sleep_steps_mood | Sleep + steps together predict mood better than either alone | sleep_logs, activity_logs, mood_logs | Multi-metric |
| TriSleepExerciseGlucoseRule | tri_sleep_exercise_glucose | Sleep + exercise interaction on glucose | sleep_logs, exercise_logs, glucose_readings | Multi-metric |
| TriCaffeineStepsSleepRule | tri_caffeine_steps_sleep | Caffeine + low steps predicts worst sleep | substance_logs, activity_logs, sleep_logs | Multi-metric |
| TriStepsWaterMoodRule | tri_steps_water_mood | Steps + hydration together lift mood | activity_logs, water_logs, mood_logs | Multi-metric |
| ChainSleepMoodSpendingRule | chain_sleep_mood_spending | Sleep → mood → spending cascade | sleep_logs, mood_logs, transactions | Multi-metric |
| QuadSleepStepsWaterMoodRule | quad_sleep_steps_water_mood | Four-way "best day" combo | sleep_logs, activity_logs, water_logs, mood_logs | 4-metric |
| ChainSleepExerciseMoodSpendingRule | chain_sleep_exercise_mood_spending | Sleep → exercise → mood → spend chain | sleep/exercise/mood/transactions | 4-metric |
| QuadGlucoseSleepMoodStepsRule | quad_glucose_sleep_mood_steps | Glucose × sleep × mood × steps | glucose/sleep/mood/activity | 4-metric |
| QuintAllMetricsRule | quint_all_metrics | All-five-metric alignment day pattern | all core logs | 5-metric |
| QuadCaffeineSleepMoodStepsRule | quad_caffeine_sleep_mood_steps | Caffeine × sleep × mood × steps | substance/sleep/mood/activity | 4-metric |
| BestDaysCommonRule | best_days_common | Behaviours common on top-20% overall-score days | daily_summaries, all logs | Phase-4 |
| StressVsSpendingRule | stress_vs_spending | High-stress days correlate with impulse spend | stress_logs, transactions | Phase-4 |
| WeatherVsMoodRule | weather_vs_mood | Weather condition (rain/cloud/sun) predicts mood | weather_data, mood_logs | Phase-4 |
| WeatherVsExerciseRule | weather_vs_exercise | Rain or extreme temps reduce exercise likelihood | weather_data, exercise_logs | Phase-4 |
| MealSizeVsSleepRule | meal_size_vs_sleep | Large dinners predict worse sleep onset | meal_logs, sleep_logs | Phase-4 |
| AlcoholQuantityVsGlucoseRule | alcohol_quantity_vs_glucose | Dose-response: drinks consumed vs glucose next morning | substance_logs, glucose_readings | Phase-4 |
| SymptomClustersRule | symptom_clusters | Co-occurring symptoms cluster around a shared trigger | symptom_logs | Phase-4 |
| MuscleGroupRotationRule | muscle_group_rotation | Exercise rotation pattern / imbalance detection | exercise_logs | Phase-4 |
| SpendingCategoryVsMoodRule | spending_category_vs_mood | Specific spend category (dining, entertainment) drives mood change | transactions, mood_logs | Phase-4 |
| TimeOfDayMoodRule | time_of_day_mood | Mood entries at a specific hour skew consistently high or low | mood_logs | Phase-4 |
| TimeOfDaySpendRule | time_of_day_spend | Discretionary spend clusters at a specific hour | transactions | Phase-4 |
| HrvVsSleepRule | hrv_vs_sleep | HRV drops after poor-sleep nights | hrv_readings, sleep_logs | Phase-4 |
| ScreenTimeVsSleepRule | screen_time_vs_sleep | Evening screen time predicts later sleep onset | screen_time_logs, sleep_logs | Phase-4 |
| TrendRestingHRRule | trend_resting_hr | Resting HR trending up or down vs prior 30d | heart_rate_readings | Trend |
| TrendSleepDurationRule | trend_sleep_duration | Sleep duration trending vs prior 30d | sleep_logs | Trend |
| TrendGlucoseVariabilityRule | trend_glucose_variability | Glucose CV% trending vs prior 30d | glucose_readings | Trend |
| TrendStepsRule | trend_steps | Daily steps trending vs prior 30d | activity_logs | Trend |
| TrendMoodRule | trend_mood | Mood score trending vs prior 30d | mood_logs | Trend |
| AnomalyDailyRule | anomaly_daily | Any metric today is >2SD from personal baseline | day_frame all metrics | Phase-5 |
| StreakBrokenRule | streak_broken_or_restart | Active streak just ended; first gap after ≥5 consecutive days | day_frame logs | Phase-5 |
| ForecastNextDayRule | forecast_next_day | Predict tomorrow's likely mood/glucose from today's patterns | day_frame, baselines | Phase-5 |
| RecoveryScoreRule | recovery_score | Composite recovery score (HRV + sleep + resting HR + steps) below threshold | day_frame | Phase-5 |
| MetabolicScoreRule | metabolic_score | Composite metabolic day score vs personal baseline | day_frame glucose/activity/sleep | Phase-5 |
| WeeklyRhythmMoodRule | weekly_rhythm_mood | Mood reliably peaks or troughs on a specific day of week | mood_logs | Phase-5 |
| WeeklyRhythmSpendRule | weekly_rhythm_spend | Spending reliably peaks on a specific day of week | transactions | Phase-5 |
| LagSleepGlucoseRule | lag_sleep_glucose | Lagged correlation: last night's sleep predicts next-morning glucose | sleep_logs, glucose_readings | Phase-5 |
| ChangePointRule | change_point | Detects a step-change in any key metric in the past 30d | day_frame | Phase-5 |
| CaffeineDoseRule | caffeine_dose_response | Dose-response inflection point for caffeine vs sleep | substance_logs, sleep_logs | Phase-5 |
| HabitClustersRule | habit_clusters_best_days | Behaviours that co-occur on the same days cluster into habit groups | day_frame all | Phase-5 |
| WorstDaysCommonRule | worst_days_common | Behaviours common on bottom-20% overall-score days | daily_summaries, all logs | Phase-5 |
| MealCompositionRule | meal_composition_glucose | Macro balance (protein/carb/fat ratio) on best vs worst days | meal_logs | Phase-5 |
| SleepArchitectureRule | sleep_architecture_mood | Deep-sleep or REM ratio below healthy band | sleep_logs (detailed) | Phase-5 |
| RecoveryDayRule | recovery_day_pattern | Identifies optimal rest days based on accumulated load | exercise_logs, hr_readings | Phase-5 |
| SymptomLagTriggerRule | symptom_lag_trigger | Symptom appears 1-2 days after a specific behaviour | symptom_logs, all behaviour logs | Phase-5 |
| SeasonalYoYRule | seasonal_yoy_mood | This month vs same month last year across key metrics | daily_summaries | Phase-5 |
| CyclePhaseRule | cycle_phase_mood_energy | Mood/energy differs significantly by menstrual cycle phase | cycle_day_logs, mood_logs | Wave 2 |
| MedicationAdherenceOutcomesRule | medication_adherence_outcomes | Full-adherence days show better mood/sleep vs skipped-dose days | medication_logs, mood/sleep | Wave 2 |
| GlucoseOvernightRule | glucose_overnight_mood | Overnight glucose CV% (00:00–06:00) predicts next-day mood | glucose_readings, mood_logs | Wave 2 |
| WeatherRainActivityRule | weather_rain_activity | Rainy days reduce activity; user's pattern quantified | weather_data, activity_logs | Wave 3 |
| WeatherTempSleepRule | weather_temp_sleep | Ambient temperature extremes correlate with sleep disruption | weather_data, sleep_logs | Wave 3 |
| WeatherDaylightMoodRule | weather_daylight_mood | Short-daylight days (< threshold hours) predict mood dip | weather_data, mood_logs | Wave 3 |
| BestDayRecipeRule | best_day_recipe | Multi-metric "recipe" of behaviours that maximise overall score | daily_summaries, all logs | Wave 3 |
| SleepExerciseInteractionRule | sleep_exercise_interaction | Sleep × exercise interaction (both good = super-additive mood) | sleep_logs, exercise_logs, mood_logs | Wave 3 |
| MealTimingSleepRule | meal_timing_sleep | Eating window closing time predicts sleep latency | meal_logs, sleep_logs | Wave 3 |

| MindfulnessVsSleepRule | mindfulness_vs_sleep | Mindfulness sessions correlate with longer or better-quality sleep | mindfulness_logs, sleep_logs | Wave 4 |
| MealSkippingVsGlucoseRule | meal_skipping_vs_glucose | Skipping breakfast predicts higher mid-morning glucose | meal_logs, glucose_readings | Wave 4 |
| WaterVsNextDayGlucoseRule | water_vs_next_day_glucose | Low-water days predict higher next-morning fasting glucose | water_logs, glucose_readings | Wave 4 |
| SleepDebtAccumulationRule | sleep_debt_accumulation | 7-day rolling sleep deficit exceeds 4-hour threshold | sleep_logs | Wave 4 |
| ChallengeActivityBoostRule | challenge_activity_boost | Average daily steps are higher during challenge weeks than non-challenge weeks | activity_logs, challenge_participants | Wave 4 |

**Total: 106 rules.**

---

## 4. Testing

### Golden-set regression suite

`backend/scripts/insight-golden-set.mjs` runs 77 assertions over the pure-function
statistical helpers in `stats.ts` and `causality.ts`. No database required. Assertions
include fired/not-fired persistence checks, the MDE key-warning path, and representative
streak-rule assertions.

**Run it:**
```bash
cd /root/wellness-app-multiuser-dev/backend
node scripts/insight-golden-set.mjs
```

Exit 0 = all pass. Any failure prints `FAIL <name>: got X, expected Y (±tol)`.

### Diagnostic-language linter

```bash
node backend/scripts/lint-insight-language.mjs
```

Scans all rule `.ts` files for prohibited diagnostic phrases (e.g. "causes", "diagnose",
"your blood sugar is elevated due to"). Must pass in CI before merging new rules.

### Adding a golden case for a new rule

1. Open `backend/scripts/insight-golden-set.impl.ts`.
2. Add a block at the end testing the specific stats helper your rule relies on with
   known inputs (e.g. if you call `welchTTest`, pick two arrays with a known expected
   p-value range).
3. Use the existing helper functions: `eq(name, actual, expected, tol)`,
   `truthy(name, cond)`, `falsy(name, cond)`.
4. Run `node scripts/insight-golden-set.mjs` to confirm it passes.

---

## 5. How to Add a New Rule

1. **Create the file** — `backend/src/rules/myNewRule.ts`.
   Export a single `const MyNewRule: InsightRule = { ... }`.

2. **Implement `runWithContext`** (preferred) or `run`.
   - Read data from `ctx.frame` (pre-built 120-day snapshot) instead of issuing new
     queries when possible.
   - Return `null` early if `ctx.capabilities` shows the user lacks required data.
   - Call `welchTTest` / `mannWhitneyU` from `stats.ts`; populate `pValue` and
     `effectSize` in the result so FDR correction and MDE gates apply automatically.

3. **Register it** — add the import and push the object into `ALL_RULES` in
   `backend/src/services/insightsEngine.ts`. Nothing else needs to change.

4. **Add a golden assertion** — see §4 above. Aim for at least two `truthy`/`falsy`
   checks covering "fires when it should" and "silent when it shouldn't".

5. **Check the language linter** — `node backend/scripts/lint-insight-language.mjs`.

6. **Update this document** — add a row to the Rule Catalog table (§3) and remove
   the item from the Roadmap (§6) if it was listed there.

---

## 6. Upgrade Roadmap

Items not yet built. Add new ideas here as they arise; move items to §Shipped when done.

### High priority

- **Circadian-rhythm phase detection** — infer user's chronotype (early/late) from
  sleep + activity patterns; adjust timing recommendations accordingly.
- **Glucose meal-response fingerprinting** — per food-category post-meal AUC curve;
  surfaces "your glucose spike after X-type meals is consistently higher than Y-type".
- **Interruptive clinicalRisk gate** — rules with `clinicalRisk: true` that fire above
  a confidence threshold should surface as a distinct banner card, not buried in the
  ranked list.
- **Cohort benchmarking** — "Your average sleep duration is in the bottom 30% of
  Ripple users with similar logging patterns." Requires privacy-safe aggregation.
- **Notification-delivered micro-insights** — push the top daily insight as a
  notification instead of requiring the user to open the app. *Partially done
  (2026-08): the nightly job now calls `pickNudgeForUser` + `recordNudgeSent`
  per user (`insightsJob.ts`), so a nudge is selected and recorded every night;
  actual push delivery is still unbuilt (no push mechanism in the backend).*

> **Timezone note (2026-08):** `moodJournalingStreak`, `exerciseConsistency`,
> `undertrainedMuscle`, and the three `streaks.ts` rules previously used
> hard-coded EST date helpers; all now use `userToday()` / `userDaysAgo()` /
> `getUserTz()` from `lib/userTz.ts`. New rules must use the per-user helpers,
> never `estToday()`.

### Medium priority

- **HRV trend rule** — dedicated HRV trend (not just HRV × sleep); compare 7d rolling
  to 30d baseline; fire when trending down ≥10%.
- **Protein intake vs muscle-recovery rule** — correlate grams of protein logged on
  workout days vs next-day resting HR / reported soreness.
- **Spending category trend** — like TrendStepsRule but for each spend category
  (dining, groceries, entertainment) separately.
- **Experiment auto-enrolment suggestions** — when a rule fires ≥3 nights in a row
  with high confidence, proactively prompt user to start the linked experiment.

### Lower priority / exploratory

- **Natural-language rule DSL** — define simple rules in JSON/YAML config so
  product/data team can add rules without TypeScript.
- **Per-user synthetic control** — for users with long histories, estimate a
  counterfactual trend to quantify intervention effects more rigorously.
- **Clustering across users** — identify user archetypes (night-owl high-exerciser,
  stressed spender, etc.) to improve cold-start priors and recommendation copy.
- **LLM-assisted rule generation** — feed dense supporting_data to Claude to draft
  candidate rule ideas; human reviews before shipping.
- **Wearable integration rules** — when Apple Health / Health Connect data is richer
  (VO2max, blood oxygen, skin temperature), add dedicated rules rather than generic HR.

---

## Shipped

All items below were planned in `INSIGHT_ENGINE_UPGRADES.md` and are now implemented.

**Statistical rigor (§1):** Welch t-test, Mann-Whitney U, Benjamini-Hochberg FDR,
MDE gates, confidence intervals, bootstrap CIs, autocorrelation-adjusted N, winsorization.

**Causality-adjacent (§2):** Time-lagged correlation, Granger lift, confounder
residualization, change-point detection, dose-response inflection.

**New signal categories (§3):** Anomaly/novelty, streak-broken, forecast, composite
Recovery Score + Metabolic Score, habit clusters, weekly rhythm, seasonality,
worst-days-common, symptom-lag trigger, meal composition, sleep architecture, recovery day.

**Wave 2:** CyclePhase, MedicationAdherenceOutcomes, GlucoseOvernight; MDE table
extensions for energy_level and glucose_cv_pct; golden-set assertions; experiment templates.

**Wave 3:** WeatherRainActivity, WeatherTempSleep, WeatherDaylightMood, BestDayRecipe,
SleepExerciseInteraction, MealTimingSleep.

**Wave 4:** MindfulnessVsSleep, MealSkippingVsGlucose, WaterVsNextDayGlucose,
SleepDebtAccumulation, ChallengeActivityBoost; challenge pre-flight skip added to
capability filter; golden-set assertions for all five rules.

**Engine architecture:** Day-frame cache, rule tiers, versioning + shadow mode, A/B
variant harness, actionable/clinical-risk metadata, incremental watermarked recomputation,
transactional runs, per-rule observability (`insight_rule_runs`).

**Ranking & lifecycle:** Multi-factor ranking, 21d decay, near-duplicate dedup, flip
detection.

**Personalization:** Feedback → weight, per-user affinity profile, global priors cold-start.

**Actionability:** 55+ experiment templates, auto-generate template fallback, experiment
outcome follow-up insights, micro-nudges (1/day, 14d per-rule cooldown).

**Presentation / UX:** Sparklines, LLM explain endpoint, timeline screen, digest endpoint,
inline confidence explainer, pinning/bookmarks, category-level meta-summary cards.

**Trust / safety:** Diagnostic-language linter, golden-set regression (77 assertions),
rule sunset policy, `/insights/:id/debug` explainability dump.
