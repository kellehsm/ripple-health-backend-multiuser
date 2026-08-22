# Screen-split refactor — remaining work

Status as of 2026-08-22 (EST). The oversized-screen split was partially completed; this file tracks what's left. Delete this file when done.

## Goal

Every screen file under ~800 lines, with cohesive sections extracted into per-screen subdirectories (`src/screens/<screen>/`), following the established pattern in `src/screens/health/` (e.g. `AdherenceHero.tsx`, `MedicationList.tsx`): typed props, state owned by the parent unless section-local, section styles move with the component. Pure structural moves only — no behavior/visual changes, preserve memoization exactly.

## Done

| Screen | Before | Now | Extracted |
|---|---|---|---|
| MindfulnessScreen | 2,010 | **174** ✅ | `mindfulness/` — BreathingSection, GroundingSection, MeditationSection, GratitudeSection, TileGrid |
| MealsScreen | 2,222 | 1,803 | `meals/` — MealCards (MiniGlucoseChart, MealsEmptyState, MacroDonut), TodaysMeals |
| OverviewScreen | ~2,790 | 1,909 | `overview/` — MetricChipsCard, TimelineCard, WeeklyReviewCard, shared.tsx |
| HealthScreen | ~2,100 | 1,854 | `health/` — GlucoseChartCard, HeartRateCard, MetricChipRow, healthScreenShared.tsx |

All extractions compile (`npx tsc --noEmit` — no new errors) and are wired into their parents.

## Remaining

1. **OverviewScreen.tsx (1,909 → ~800)** — the split was interrupted mid-run. Candidate sections still inline: greeting/header block, streak row + its Animated.Value arrays, correlation section, remaining cards not covered by the three extracted ones. Continue into `src/screens/overview/`.
2. **HealthScreen.tsx (1,854 → ~800)** — continue extracting per-metric sections (steps/sleep cards, water chip area) into `src/screens/health/`.
3. **MealsScreen.tsx (1,803 → ~800)** — extract the add-food sheet / search modal area and any remaining large sections into `src/screens/meals/`.

## Notes

- Prefer fewer, larger extractions over many tiny files.
- List virtualization was evaluated and deliberately **skipped**: all flagged `.map()` lists sit inside whole-page ScrollViews (same-orientation FlatList nesting is an RN anti-pattern) or are short/horizontal. Revisit only if a list demonstrably grows large — the fix then is converting the page itself to a FlatList with `ListHeaderComponent`.
- Verify with `npx tsc --noEmit` after each screen (pre-existing errors exist in App.tsx, backend/substances, templates/, plaidLink, CardImageSplitterScreen, FriendsOnboardingScreen — ignore those).
