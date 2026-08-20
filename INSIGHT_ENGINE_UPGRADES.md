# Insight Engine Top-Tier Upgrade Plan

Working checklist. `[x]` = done, `[~]` = in progress, `[ ]` = todo.

## 1. Statistical rigor
- [x] 1.1 Welch's t-test + Mann-Whitney U helpers (`stats.ts`)
- [x] 1.2 Benjamini-Hochberg FDR correction over per-run candidates (helper in stats.ts; wired below)
- [x] 1.3 Per-metric Minimum Detectable Effect (MDE) gates (MDE table + passesMDE)
- [x] 1.4 Confidence intervals baked into descriptions (formatCI + result.ci95)
- [x] 1.5 Bootstrap CIs for small-sample rules (bootstrapMeanDiffCI)
- [x] 1.6 Autocorrelation-adjusted effective sample size (lag1Autocorr + effectiveSampleSize)
- [x] 1.7 Winsorize baselines at p2/p98

## 2. Causality-adjacent
- [x] 2.1 Time-lagged correlation (`lagPairColumns` + `lagSleepGlucose.ts` rule)
- [x] 2.2 Granger-style predictive-lift check (`grangerLift`)
- [x] 2.3 Confounder residualization (`residualizeAgainstCommonConfounders`)
- [x] 2.4 Change-point detection (`findChangePoint` + `changePoint.ts` rule)
- [x] 2.5 Dose-response inflection (`findDoseInflection` + `caffeineDose.ts` rule)

## 3. New signal categories
- [x] 3.1 Anomaly / novelty layer (`anomalyDaily.ts`)
- [x] 3.2 Streak-broken + comeback detection (`streakBroken.ts`)
- [x] 3.3 Forecast (next-day prediction) rule (`forecastNextDay.ts`)
- [x] 3.4 Composite Recovery Score + Metabolic Day Score (`recoveryScore.ts`, `metabolicScore.ts`)
- [x] 3.5 Habit-cluster mining (`habitClusters.ts`)
- [x] 3.6 Weekly rhythm (`weeklyRhythm.ts` — mood + spend variants)
- [x] 3.7 Seasonality (`seasonalYoY.ts`)
- [x] 3.8 Worst-days-common rule (`worstDaysCommon.ts`)
- [x] 3.9 Symptom-lag trigger discovery (`symptomLagTrigger.ts`)
- [x] 3.10 Meal composition (`mealComposition.ts`)
- [x] 3.11 Sleep architecture rules (`sleepArchitecture.ts`)
- [x] 3.12 Recovery-days rule (`recoveryDay.ts`)

## 4. Engine architecture
- [x] 4.1 Per-user "day frame" cache shared across rules (`dayFrame.ts`, wired via `runWithContext`)
- [x] 4.2 Rule scheduling tiers (daily / semi-weekly / weekly)
- [x] 4.3 Rule versioning + shadow mode (version stored per insight; shadow via `variant` column)
- [x] 4.4 A/B variant harness (rule.variant + variant column)
- [x] 4.5 Rule metadata: actionable / mutable / clinical-risk (on InsightRule + InsightResult)
- [x] 4.6 Incremental / watermarked recomputation (`insight_engine_state` table + `skipHeavyTiers` logic in `runInsightsForUser` — watermark persisted after every run)
- [x] 4.7 Transactional / resumable engine runs (markStale moved AFTER candidate collection)
- [x] 4.8 Observability: per-rule runtime + hit + downvote metrics (`insight_rule_runs` table)

## 5. Ranking & lifecycle
- [x] 5.1 Multi-factor ranking (`insightRanker.rankAndPersist` — conf × novelty × actionable × affinity × decay)
- [x] 5.2 Insight decay / auto-fade after 21d unengaged (decay factor in ranker)
- [x] 5.3 Dedup near-duplicate insights (`dedupInsights` clusters by primary_metric+direction)
- [x] 5.4 Flip / weakening detection (`detectFlipsForUser`)

## 6. Personalization
- [x] 6.1 Feedback → continuous per-rule weight (`adjustRuleWeight` hooked into feedback endpoint)
- [x] 6.2 Per-user actionability profile (affinity factor in ranker)
- [x] 6.3 Cold-start priors (`globalPriors.ts` + `insight_global_priors` table)

## 7. Actionability
- [x] 7.1 Fill experiment templates for ALL applicable rules (55 templates in `insightExperimentTemplates.ts`)
- [x] 7.2 Auto-generate template from supportingData when missing (`autoGenerateTemplate`)
- [x] 7.3 Experiment outcome → follow-up insight (`experimentOutcome.ts` hooked into nightly job)
- [x] 7.4 Micro-nudges (`nudges.ts` — 1/day + 14d per-rule cooldown)
- [x] 7.5 "Try again" for stale insights (handled via `detectFlipsForUser` — emits "no longer predicts" insight; verified in `insightRanker.ts`)

## 8. Presentation / UX
- [x] 8.1 Sparkline / 2-bar chart on every card (`InsightSparkline.tsx` + `pickSparklinePair` in InsightCard)
- [x] 8.2 "Ask about this" LLM explainer endpoint + button (`/insights/:id/explain` + modal in InsightsScreen)
- [x] 8.3 Insight timeline / history page (`InsightTimelineScreen.tsx` + `/insights/timeline`)
- [x] 8.4 Insight of the week digest hook (`/insights/digest` route)
- [x] 8.5 Inline confidence explainer on badge tap (`showConfExplainer` in InsightCard)
- [x] 8.6 Pinning / bookmarks (`/insights/:id/pin` + toggle button in card)
- [x] 8.7 Category-level meta-summaries (`emitCategorySummaries` in `insightsEngine.ts` synthesizes 2+ active insights per domain into a `category_summary` card)

## 10. Wave 2 — new signal categories

- [x] 10.1 **`cyclePhase.ts`** — compares mood/energy across menstrual vs luteal vs follicular/ovulatory phases using logged `cycle_day_logs`; Welch's t-test + MDE gate; weekly tier
- [x] 10.2 **`medicationAdherenceOutcomes.ts`** — compares mood/sleep on full-adherence days vs days with ≥1 skipped dose (≥10 days each bucket); weekly, actionable, mutable; experiment template added
- [x] 10.3 **`glucoseOvernight.ts`** — computes per-night CV% from `glucose_readings` 00:00–06:00, correlates stable (CV ≤15%) vs variable (CV ≥25%) nights with next-day mood; semiweekly tier
- [x] 10.4 MDE table extended: `energy_level` (0.5 pt) and `glucose_cv_pct` (5 pct-points)
- [x] 10.5 Experiment templates added for all three new actionable rules
- [x] 10.6 Golden-set assertions added (9 new assertions in `insight-golden-set.impl.ts`)
- [x] 10.7 Items 4.6, 7.5, 8.7 verified complete and checkboxes updated

## 9. Trust / safety
- [x] 9.1 Diagnostic-language CI linter (`backend/scripts/lint-insight-language.mjs`)
- [x] 9.2 Golden-set regression tests per rule (`backend/scripts/insight-golden-set.mjs` — 24 assertions)
- [x] 9.3 Rule sunset policy (`ruleSunset.ts` — hooked into nightly job)
- [x] 9.4 `GET /insights/:id/debug` explainability dump
