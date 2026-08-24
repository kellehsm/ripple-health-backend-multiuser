# RESUME: Full-app audit fix session (paused 2026-08-24, weekly limit hit)

**Delete this file once the work is committed.**

## Where we are

Five Fable audit agents (frontend, backend, security, UX/UI, features/polish) audited the whole app. User said: **"fix all — do all fixes and all polish; if any aren't direct fixes, offer options."** Fix wave 1 is DONE and sitting **uncommitted** in this repo. Wave 2 was about to launch when the limit hit.

Note on agents: default is Sonnet, but for THIS effort the user wants **Fable agents** (omit the `model` param) to spend his Fable allotment.

## Already applied (uncommitted in working tree — do NOT redo)

- **Frontend bug fixes (13)**: FastingTimerCard hooks-order crash; cold-start biometric lock bypass (App.tsx initAuth); AnimatedNumber interpolate memo; syncQueue 15s AbortController; dateUtils formatDate T12:00:00; ExerciseSession HR poll 1s→15s; HealthScreen refresh → useFocusEffect; MealsScreen offline-queued meal toast "Saved — will sync when online"; Overview mood-modal minuteTick + greeting recompute; CARD_COUNT 9→12; RootTabs medicationDue badge wired; iOS shortcut toast via showToast.
- **Backend bug fixes (13)**: medications medSelect(99)→medSelect(2) 500 fix; user-tz `AT TIME ZONE` day boundaries in summary.ts (/pattern, streaks, digest buckets), metrics.ts breakdowns, dailySummaryJob pre-flight; transactions on med create/PATCH/import; adherence tz; caffeine/alcohol/lateMeals VsSleep reversed joins fixed + caffeine migrated to modern stats; insightsEngine atomic swap transaction; steps MAX/day standardized; monthly-review error logging; bounded metric aggregates; **new migration `backend/migrations/050_metrics_unique_user_name.sql`** (NOT run against any DB yet); medications PATCH null-clearing; tCritical95(df) in stats.ts; insights history/timeline offset pagination.
- **Security fixes**: rate-limit key = verified user id else IP (server.ts + middleware/auth.ts rateLimitKey); widget receivers `exported="false"` (withAndroidWidget.js); `allowBackup: false` in app.json; prod CORS https-only; helmet CSP enabled with /admin/media exemption. media_assets confirmed non-private (no change).
- Typechecks verified at baseline: frontend 26 pre-existing errors (StatusBar, notifee, plaidLink, CardImageSplitter, FriendsOnboardingScreen, templates), backend substances.ts pre-existing only. Zero new errors.

## TODO — Wave 2 (not started; the two agent prompts were fully drafted — see transcript, or rebuild from below)

Spawn two Fable agents (omit model), working directly in this repo, preserving uncommitted changes:

**Agent A — UX/UI sweep** (do not touch backend/, plugins/, docs/, App.tsx, OverviewScreen/overview/*):
1. SignupScreen/LoginScreen hardcoded blob hexes + "#111" shadows → theme tokens + warm rgba(60,40,20,0.1).
2. Black shadows → warm in LifeScreen:1067, health/CycleView (6 spots), settings/BanksSettingsScreen:94, settings/SocialSettingsScreen:258, mindfulness/shared.tsx:164.
3. Delete cool Tailwind hex fallbacks (`?? "#14b8a6"` etc.) in FinanceScreen, GlucoseDetailScreen, OnboardingFlow, CompletedScreen.
4. Style-factory hex defaults MealsScreen:~1089, FinanceScreen:~1144 → pass theme tokens.
5. Inline uppercase micro-labels → `<SectionLabel>` in MedicationHistoryScreen, ChallengeDetailScreen, CompletedScreen, NewChallengeScreen.
6. Login/Signup ALL-CAPS labels → sentence case.
7. Missing states: ChatScreen (loading+error/retry), TrendsScreen (empty+error), LeaderboardScreen (loading+empty), ChallengesScreen (loading), MonthlyRecapScreen (LoadingIndicator+retry), HistoryScreen (error banner), HelpScreen (check if it fetches).
8. A11y labels + role on icon-only pressables: Login/Signup/History/Trends/Leaderboard/Mindfulness/Chat/settings; hitSlop on small buttons; enlarge ExperimentScreen:457 checkbox, MedicationList:791 dose circle.
9. OnboardingFlow emoji icons → ThemedIcon/Ionicons (incl. ❤️ variation selector); standardize back affordance (MedicationImportScreen:204, ExperimentScreen:276,346).

**Agent B — polish wave** (avoid Agent A's files; may touch mindfulness, WaterDetail, HealthScreen minimally, insights UI, backend rules):
1. Mindfulness streak milestone (7/30/100) confetti + haptic, once per milestone (AsyncStorage), reuse existing confetti.
2. New-insight shimmer on insights created in latest nightly batch (respect useReduceMotion).
3. Empty-state coach cards with CTA: CycleView + hobbies (SKIP finance — Agent A owns it).
4. WaterDetail goal-hit droplet burst + success haptic, once/day.
5. Pull-to-refresh completion haptic on HealthScreen + WaterDetail.
6. Backend `rules/hydrationVsGlucose.ts` — modern stats pattern (copy alcoholVsMood), user-tz days (see fixed caffeineVsSleep), register in rule registry.

## User decisions still pending

1. **JWT lifetime** (security Med): (a) keep 30d + "log out everywhere" button, (b) 7d token, (c) refresh-token rotation. NOT implemented — awaiting pick.
2. **Font-size migration** (~90 hardcoded fontSize 20-39): (a) hot screens only, (b) full sweep. Skipped pending pick.

## After wave 2

1. `npx tsc --noEmit` (root + backend/) — zero new errors vs baselines above.
2. Update docs: FEATURES.md (polish items, new rule), BACKEND.md (migration 050, pagination, tz fixes, security hardening), FRONTEND.md (bug-fix wave note; widget receiver export change is native → next build), INSIGHT_ENGINE.md (fixed sleep-rule causality, new hydrationVsGlucose), UX_UI.md if any rule clarified. POLISH_BACKLOG.md: remove shipped polish items / append any new deferred ideas.
3. Show full diff, get explicit approval, commit to dev; push: both `frontend` and `origin` remotes (frontend+backend both changed).
4. Migration 050 must be run on dev DB (and later prod at deploy) — ask user before touching any DB. No merges to master / prod restarts / builds without explicit approval.
5. Remaining feature-audit items (export UI, quick-log meals, spending forecast, sleep-debt, nudge push, cycle overlays, etc.) were NOT requested yet — they're a menu for later.
