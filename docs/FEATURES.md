# Ripple Wellness — Master Feature Set

> **Living document — update the relevant section whenever a feature is added or changed.**

Ripple Wellness is an Expo React Native app (TypeScript) backed by a Fastify/PostgreSQL API. It aggregates health metrics, nutrition, finance, social challenges, and AI-generated insights into a single personal wellness dashboard. The dev repo lives at `/root/wellness-app-multiuser-dev`; backend routes register under `/api/<prefix>` (prefixes defined in `backend/src/server.ts`).

---

## Domain Index

| # | Domain | Route file(s) | Key screens |
|---|--------|--------------|-------------|
| 1 | Auth & Accounts | `auth.ts`, `google-auth.ts` | Login, Signup, Onboarding |
| 2 | Overview / Dashboard | `dashboard.ts`, `summary.ts` | Overview, History, MonthlyRecap, Trends |
| 3 | Health Metrics (custom) | `metrics.ts` | HealthScreen, HealthTabScreen |
| 4 | Medications | `medications.ts`, `medication-doses.ts`, `medication-categories.ts`, `medication-prescribers.ts` | MedicationHistory, MedicationImport |
| 5 | Glucose / Dexcom | `glucose.ts`, `glucose-status.ts`, `dexcom-auth.ts` | HealthScreen (glucose card), GlucoseDetail |
| 6 | Heart Rate | `heart-rate.ts`, `health-connect.ts` | HeartRateDetail |
| 7 | Sleep | `health-connect.ts` | SleepDetail, HealthScreen |
| 8 | Steps & Exercise | `health-connect.ts`, `exercise.ts`, `programs.ts` | Exercise, ExerciseDetail, ExerciseSession, WorkoutSetupWizard, StepsDetail |
| 9 | Meals / Nutrition (Passio) | `meals.ts`, `food.ts`, `recipes.ts`, `substances.ts` | Meals |
| 10 | Finance (Plaid) | `plaid.ts`, `spending.ts` | Finance |
| 11 | Cycle Tracking | `cycle.ts` | health/CycleView, health/CycleDayLogModal |
| 12 | Mindfulness | `mindfulness.ts` | Mindfulness, mindfulness/* |
| 13 | Hobbies / Life | `hobbies.ts`, `books.ts`, `books-search.ts`, `hardcover.ts`, `completed.ts` | Life, CompletedScreen |
| 14 | Challenges & Friends | `challenges.ts`, `friends.ts`, `social-notifications.ts` | Challenges, ChallengeDetail, NewChallenge, Friends, FriendsOnboarding, Leaderboard |
| 15 | Insights Engine | `insights.ts`, `summary.ts`, `analytics.ts`, `annotations.ts` | Insights, InsightsHistory, InsightsTrends |
| 16 | AI Chat | `chat.ts` | Chat |
| 17 | Journal / Mood | `journal.ts` | (embedded in Overview/Health) |
| 18 | Weather | *(sync job only)* | WeatherLocationSettings |
| 19 | Exports & Reports | `export.ts`, `google-drive.ts` | settings/ExportBackupSettings |
| 20 | Watch Tiles / Widgets | `auth.ts` (widget token) | WatchTiles |
| 21 | Search | `search.ts` | GlobalSearch |
| 22 | Demo Mode | `auth.ts` | Login |
| 23 | Admin | `admin.ts` | *(no screen — API only)* |
| 24 | Settings & Preferences | `settings.ts`, `tab-preferences.ts`, `hints.ts`, `media.ts`, `error-reports.ts` | Settings, 15 sub-screens, HelpScreen |
| 25 | Offline Sync Queue | `sync.ts` | *(no dedicated screen — mobile utility)* |

---

## 1. Auth & Accounts

**What it does:** Email/password login with bcrypt, Google OAuth (via `google-auth.ts`), JWT issuance with per-user `token_version` for remote invalidation. Signup flow is onboarding-gated. A DEMO_LOGIN_ENABLED env var allows `demo@ripple.test` bypass in dev only.

**Screens:** `src/screens/LoginScreen.tsx`, `src/screens/SignupScreen.tsx`, `src/screens/OnboardingFlow.tsx`

**API:**
| Method | Path | File |
|--------|------|------|
| POST | `/api/auth/login` | `auth.ts` |
| POST | `/api/auth/signup` | `auth.ts` |
| POST | `/api/auth/create-user` | `auth.ts` (admin secret required) |
| PATCH | `/api/auth/password` | `auth.ts` |
| GET | `/api/auth/widget-token` | `auth.ts` |
| GET | `/api/google-auth/login` | `google-auth.ts` |
| GET | `/api/google-auth/callback` | `google-auth.ts` |

**Data:** `users` (email, password_hash, token_version, settings JSONB)

**Status:** Shipped

---

## 2. Overview / Dashboard

**What it does:** Single-round-trip batch endpoint (`/api/dashboard`) aggregates ~15 sub-calls for the Overview screen. `summary.ts` provides streak counts, weekly/monthly digests, pattern detection, "what changed", and AI-generated monthly narratives. The Overview screen includes a **Wellness Score Card** (animated ring with sparkline history), a **Fasting Timer Card** (start/stop timer; notification labels at 12h/16h/24h shown in UI; scheduling recently shipped), a **Quick Log Sheet** (bottom sheet for logging water, mood, steps, glucose, meals, or sleep from the metric chips row), milestone banners (triggered by streak achievements), and a **What's New modal** accessible manually from Settings (auto-trigger on app update recently shipped).

**Screens:** `src/screens/OverviewScreen.tsx`, `src/screens/HistoryScreen.tsx`, `src/screens/MonthlyRecapScreen.tsx`, `src/screens/TrendsScreen.tsx`, `src/screens/InsightsTrendsScreen.tsx`

**API:**
| Method | Path | File |
|--------|------|------|
| GET | `/api/dashboard` | `dashboard.ts` |
| GET | `/api/summary/wellness-history` | `summary.ts` |
| GET | `/api/summary/weekly-digest` | `summary.ts` |
| GET | `/api/summary/streaks` | `summary.ts` |
| GET | `/api/summary/pattern` | `summary.ts` |
| GET | `/api/summary/what-changed` | `summary.ts` |
| GET | `/api/summary/monthly-review` | `summary.ts` |
| GET | `/api/summary/monthly-narrative` | `summary.ts` |
| GET | `/api/summary/day` | `summary.ts` |
| GET | `/api/summary/why-might-that-be` | `summary.ts` |

**Data:** `daily_summary`, `journal_entries` (mood), all domain tables

**Status:** Shipped

---

## 3. Health Metrics (Custom)

**What it does:** User-defined numeric metrics (water intake is a built-in example). Supports logs, daily/weekly/monthly breakdowns, and stats. Water goal is surfaced in the dashboard.

**Screens:** `src/screens/HealthScreen.tsx`, `src/screens/HealthTabScreen.tsx`, `src/screens/WaterDetailScreen.tsx`

**Water detail screen** (`WaterDetailScreen.tsx`): dedicated screen reachable from the water chip on HealthScreen. Features a droplet-fill hero, ripple log button, today's intake timeline, 7-day droplet strip, streak stats, and an AsyncStorage-backed goal editor.

**Water MetricChip (HealthScreen):** quick-press logs one glass immediately with haptic feedback (optimistic update); long-press navigates to `WaterDetail`. A bug where logged glasses did not appear in the chip (bad filter callback) has been fixed.

**API:**
| Method | Path | File |
|--------|------|------|
| GET | `/api/metrics` | `metrics.ts` |
| POST | `/api/metrics` | `metrics.ts` |
| GET | `/api/metrics/water/today` | `metrics.ts` |
| POST | `/api/metrics/:id/logs` | `metrics.ts` |
| GET | `/api/metrics/:id/logs` | `metrics.ts` |
| GET | `/api/metrics/:id/stats` | `metrics.ts` |
| GET | `/api/metrics/:id/daily-breakdown` | `metrics.ts` |
| GET | `/api/metrics/:id/monthly-breakdown` | `metrics.ts` |
| GET | `/api/metrics/:id/weekly-total` | `metrics.ts` — returns `{ week_total, last_week_total, month_to_date_total }`, honors `week_start_day` |

**Data:** `metrics`, `metric_logs`

**Status:** Shipped

---

## 4. Medications

**What it does:** Full medication management: add/edit/delete meds, schedule dose slots, log doses (taken/skipped/PRN), track prescribers, color-code by category, calculate adherence, link RxNorm drug IDs, pull FDA drug labels, import via CSV, and view history. A separate medication reminders screen lives in settings.

**Screens:** `src/screens/MedicationHistoryScreen.tsx`, `src/screens/MedicationImportScreen.tsx`, `src/screens/health/AddMedicationModal.tsx`, `src/screens/health/AdherenceHero.tsx`, `src/screens/settings/MedicationRemindersScreen.tsx`

**API:** `medications.ts` (14 routes), `medication-doses.ts` (5 routes), `medication-categories.ts` (4 routes), `medication-prescribers.ts` (4 routes)

Key routes: `GET /api/medications`, `POST /api/medications`, `GET /api/medications/adherence`, `GET /api/medications/:id/history`, `POST /api/medications/import/commit`

**Data:** `medications`, `medication_dose_logs`, `medication_history`, `medication_schedule_slots`, `medication_prescribers`, `medication_color_categories`

**External deps:** RxNorm API (NIH), FDA drug label API

**Status:** Shipped

---

## 5. Glucose / Dexcom

**What it does:** Manual glucose readings plus Dexcom CGM integration via OAuth (Dexcom Share API). Supports time-in-range (TIR) calculation, yesterday overlay on chart, glucose-status card for dashboard, and chart annotations. Dexcom sandbox supported via env var.

**Screens:** Embedded in `HealthScreen.tsx`; `src/screens/GlucoseDetailScreen.tsx` (route `"GlucoseDetail"`); `src/screens/settings/DexcomSettingsScreen.tsx`

**GlucoseDetailScreen** — dedicated drill-down screen reached from the glucose MetricChip on HealthScreen:
- **24-hour chart** with shaded target band (70–180 mg/dL)
- **24h stats bar**: avg, low, high, time-in-range (TIR)
- **7-day time-of-day bucket averages**: readings from the past 7 days grouped into time-of-day buckets (e.g. morning / afternoon / evening / night) and averaged
- **30-day summary**: overall avg, TIR %, standard deviation
- Uses existing `api.glucoseRange(start, end)` — no new backend routes

**API:**
| Method | Path | File |
|--------|------|------|
| GET | `/api/glucose` | `glucose.ts` |
| POST | `/api/glucose` | `glucose.ts` |
| GET | `/api/glucose/tir` | `glucose.ts` |
| POST | `/api/glucose/sync-share` | `glucose.ts` |
| GET | `/api/glucose-status` | `glucose-status.ts` |
| GET | `/api/dexcom-auth/login` | `dexcom-auth.ts` |
| GET | `/api/dexcom-auth/callback` | `dexcom-auth.ts` |
| POST | `/api/dexcom` | `dexcom-verify.ts` — verify Dexcom Share credentials and store encrypted in user settings |
| GET | `/api/annotations` | `annotations.ts` |
| POST/DELETE | `/api/annotations` | `annotations.ts` |

**Data:** `glucose_readings`, `chart_annotations`, `dexcom_share_sessions` (migration 043)

**External deps:** Dexcom Share API / Dexcom OAuth (sandbox: `sandbox-api.dexcom.com`)

**Status:** Shipped

---

## 6. Heart Rate

**What it does:** Ingest heart rate readings in bulk from Health Connect (Android). Provides daily summary, recent readings list, and advanced stats. Used by the Insights Engine for recovery score computation.

**Screens:** `src/screens/HeartRateDetailScreen.tsx` — upgraded with: 30-day resting-HR trend chart with 7-day rolling average, week-vs-last-week comparison (honors `week_start`), time-in-zones (DOB-based max HR; falls back to 190 if DOB absent), today's min/max with timestamps, and an HR insight banner. NaN guards added: null/non-finite samples are filtered before all stat computations; stat display falls back to `"--"` placeholders when no valid data exists.

**API:**
| Method | Path | File |
|--------|------|------|
| GET | `/api/heart-rate` | `heart-rate.ts` |
| GET | `/api/heart-rate/daily` | `heart-rate.ts` — last-N-days-with-data (not NOW-anchored); `resting_bpm` via `PERCENTILE_CONT(0.05)`; default N=7, max 30 |
| GET | `/api/heart-rate/stats` | `heart-rate.ts` — 30-day resting trend, rolling avg, zones, week comparison |
| POST | `/api/health-connect/heart-rate` | `health-connect.ts` |

**Data:** `heart_rate_readings`

**External deps:** Android Health Connect

**Status:** Shipped

---

## 7. Sleep

**What it does:** Sleep sessions synced from Health Connect with optional sleep stages (REM, deep, light, awake). Exposes range queries, stats, and per-session detail. Sleep data feeds Insights Engine correlations.

**Screens:** `src/screens/SleepDetailScreen.tsx`. HealthScreen sleep MetricChip navigates directly to `SleepDetail` on press. The inline expanded sleep panel previously shown on HealthScreen has been removed.

**API:**
| Method | Path | File |
|--------|------|------|
| POST | `/api/health-connect/sleep` | `health-connect.ts` |
| GET | `/api/health-connect/sleep` | `health-connect.ts` |
| GET | `/api/health-connect/sleep/range` | `health-connect.ts` |
| GET | `/api/health-connect/sleep/stats` | `health-connect.ts` — extended with `week_avg_seconds`, `last_week_avg_seconds`, `bedtime_spread_mins` (additive) |

**Data:** `sleep_sessions` + `sleep_stages` (migration 030)

**External deps:** Android Health Connect; `src/screens/settings/HealthConnectSettingsScreen.tsx`

**Samsung Health:** supported via Health Connect — Samsung Health syncs steps/sleep/HR into Health Connect (user enables it in Samsung Health → Settings → Connected services). The Health Connect settings screen has a Samsung Health setup card. No direct Samsung API integration. Disconnect controls added: `revokeAllPermissions` + Samsung Health guidance.

**Steps counting:** raw step records are summed per data source per local day and the highest single source wins (`src/lib/healthConnect.ts`) — favors watch data over the phone pedometer without double-counting, sidestepping HC's app-priority aggregate. Sync triggers: manual (Health screen / HC settings) plus silent auto-sync on app launch/foreground, throttled to once per 15 min (`maybeAutoSync`). The app can only ever match what Samsung Health actually writes into Health Connect, which can trail Samsung Health's in-app total.

**Status:** Shipped

---

## 8. Steps & Exercise

**What it does:** Step counts synced from Health Connect. Exercise library + session logging with set/rep/weight entries, progressive overload tracking, and a Workout Setup Wizard that generates a personalized program. Includes AI-suggested next workout.

**Screens:** `src/screens/ExerciseScreen.tsx`, `src/screens/ExerciseDetailScreen.tsx`, `src/screens/ExerciseSessionScreen.tsx`, `src/screens/WorkoutSetupWizard.tsx`, `src/screens/CustomPlanBuilderScreen.tsx`, `src/screens/StepsDetailScreen.tsx`

**Custom Plan Builder** (`CustomPlanBuilderScreen.tsx`, route `"CustomPlanBuilder"`): lets users manually build a multi-day workout program from scratch — add/remove days, set a focus label per day, pick exercises from the library, and configure sets/reps/weight. Saves the program via the programs API. — steps detail now shows This week / Last week / Month-to-date / Daily avg panels; the Day by Day list ends with a weekly Total row (this week vs last week with diff). HealthScreen step chip shows the current week total.

**API:** `exercise.ts` (12 routes), `programs.ts` (11 routes), `health-connect.ts` (`/steps` GET+POST)

Key routes: `GET /api/exercise/library`, `POST /api/exercise/sessions` (accepts optional `started_at`/`ended_at` for retroactive logging), `GET /api/exercise/suggestion`, `GET /api/exercise/detected-workout`, `GET /api/exercise/progression/:id`, `GET /api/programs/wizard/status`, `POST /api/programs/wizard/generate`

**Workout detection:** `GET /api/exercise/detected-workout` scans today's `heart_rate_readings` for a sustained elevated window (bpm ≥ max(resting+35, 100) where resting = 7-day 5th percentile; ≥15 min span, gaps ≤5 min allowed) that doesn't overlap any logged `exercise_sessions` row. ExerciseScreen shows a "Workout detected" card (time range, avg/peak bpm) with **Log workout** (creates a session with the detected start/end, opens ExerciseSessionScreen to add exercises) and **Dismiss** (window start persisted in AsyncStorage so it doesn't re-prompt).

**Data:** `exercise_library`, `exercise_sessions`, `exercise_log_entries`, `workout_programs`, `workout_program_days`, `workout_program_exercises`

**External deps:** Android Health Connect

**Status:** Shipped

---

## 9. Meals / Nutrition (Passio)

**What it does:** Log meals with food items sourced from Passio nutritionix AI (barcode scan, plate photo — camera capture or gallery pick via expo-image-picker, text search, or manual). Tracks macros. Recipes (custom food combos). Glucose-response scoring per meal. Substance sub-tracker (caffeine and alcohol via USDA nutrient data). Frequent foods shortcut list.

**Screens:** `src/screens/MealsScreen.tsx`

**API:**
| Method | Path | File |
|--------|------|------|
| GET/POST | `/api/meals` | `meals.ts` |
| PATCH/DELETE | `/api/meals/:id` | `meals.ts` |
| GET | `/api/meals/impact-scores` | `meals.ts` |
| GET | `/api/meals/frequent` | `meals.ts` |
| GET | `/api/meals/:id/glucose-response` | `meals.ts` |
| GET | `/api/food/passio-key` | `food.ts` |
| GET | `/api/food/search` | `food.ts` |
| GET | `/api/food/barcode/:code` | `food.ts` |
| POST | `/api/food/barcode/:code/correction` | `food.ts` |
| CRUD | `/api/recipes` | `recipes.ts` |
| GET | `/api/substances` | `substances.ts` |

**Data:** `meals` (with servings column — migration 039), `recipes`

**External deps:** Passio Nutrition AI SDK (key served via `/api/food/passio-key`), USDA FoodData Central (for substance nutrient lookup)

**Status:** Shipped

---

## 10. Finance (Plaid)

**What it does:** Bank account linking via Plaid Link. Transaction sync (webhook-driven). Manual spending entries with optional mood tag. Budget categories with weekly spending totals and mood-correlation query. Supports multiple Plaid items (banks). Sandbox helpers for dev.

**Screens:** `src/screens/FinanceScreen.tsx`, `src/screens/settings/BanksSettingsScreen.tsx`

**API:** `plaid.ts` (9 routes), `spending.ts` (5 routes)

Key routes: `POST /api/plaid/create-link-token`, `POST /api/plaid/exchange-token`, `GET /api/plaid/accounts`, `POST /api/plaid/sync`, `GET/POST/PATCH/DELETE /api/spending`

**Data:** `spending_entries`; Plaid item metadata stored in `users.settings` JSONB

**External deps:** Plaid API (`plaid` npm package)

**Status:** Shipped

---

## 11. Cycle Tracking

**What it does:** Menstrual cycle day logging with symptoms, moods, and custom symptom definitions. Provides cycle phase prediction, phase-based patterns, energy curve, ranked symptoms/moods, and cycle history. Surfaced on Health tab and as an overview insight.

**Screens:** `src/screens/health/CycleDayLogModal.tsx`, `src/screens/health/CycleView.tsx`, `src/screens/health/CycleHero.tsx`, `src/screens/health/CycleInsights.tsx`, `src/screens/health/SymptomsView.tsx`

**API:** `cycle.ts` (14 routes) — key: `POST /api/cycle/logs`, `GET /api/cycle/prediction`, `GET /api/cycle/phase-patterns`, `GET /api/cycle/energy-curve`, `GET /api/cycle/overview-insight`

**Data:** `cycle_day_logs`, `cycle_custom_symptoms` (migration adds these)

**Status:** Shipped

---

## 12. Mindfulness

**What it does:** Log mindfulness sessions (meditation, body scan, gratitude, soundscapes). Provides cumulative stats and a journal view of past sessions. Seven guided sections: breathing exercises, grounding techniques, guided meditation, gratitude prompts, journaling, body scan, and soundscapes.

**Screens:** `src/screens/MindfulnessScreen.tsx`, `src/screens/mindfulness/BreathingSection.tsx`, `src/screens/mindfulness/GroundingSection.tsx`, `src/screens/mindfulness/MeditationSection.tsx`, `src/screens/mindfulness/GratitudeSection.tsx`, `src/screens/mindfulness/JournalSection.tsx`, `src/screens/mindfulness/BodyScanSection.tsx`, `src/screens/mindfulness/SoundscapesSection.tsx`, `src/screens/mindfulness/GratitudeHistory.tsx`, `src/screens/mindfulness/StatsHero.tsx`

**HealthScreen entry point:** the full-width mindfulness bar is back (restored 2026-08-24, above the chip grid) and the MIND chip is gone. The five remaining MetricChips are laid out 3-over-2: glucose/steps/sleep on top, water/heart centered beneath so each sits under a gap of the top row (`src/screens/health/MetricChipRow.tsx`).

**API:**
| Method | Path | File |
|--------|------|------|
| POST | `/api/mindfulness/log` | `mindfulness.ts` |
| GET | `/api/mindfulness/stats` | `mindfulness.ts` |
| GET | `/api/mindfulness/journal` | `mindfulness.ts` |

**Data:** `daily_summary` JSONB (mindfulness fields) — no dedicated table confirmed in schema

**Status:** Shipped (soundscapes UI is native audio; content fetched dynamically from `api.mediaList()` — not static)

---

## 13. Hobbies / Life / Books

**What it does:** Track hobbies with session logs and stats. Track books (reading list, progress logs, ratings, status: reading/finished/want-to-read). Hardcover integration for book search and library sync. CompletedScreen aggregates finished books and hobbies.

**Screens:** `src/screens/LifeScreen.tsx`, `src/screens/CompletedScreen.tsx`

**API:**
| Method | Path | File |
|--------|------|------|
| CRUD + logs | `/api/hobbies` | `hobbies.ts` |
| GET stats | `/api/hobbies/:id/stats` | `hobbies.ts` |
| CRUD + logs | `/api/books` | `books.ts` |
| GET progress | `/api/books/:id/progress` | `books.ts` |
| GET | `/api/books-search` | `books-search.ts` |
| GET/POST/DELETE | `/api/hardcover/*` | `hardcover.ts` |

**Data:** `books`, `reading_logs`, `hobbies`, `hobby_logs`

**External deps:** Hardcover API (GraphQL — `src/screens/settings/HardcoverSettingsScreen.tsx` for token setup)

**Status:** Shipped

---

## 14. Challenges & Friends / Leaderboard

**What it does:** Friend system with connection requests, sharing preferences, and a per-category leaderboard. Challenges (create, join, leave, detail view). Friend activity feed, nudges, cheers (reactions), and social notifications. Username management.

**Screens:** `src/screens/ChallengesScreen.tsx`, `src/screens/ChallengeDetailScreen.tsx`, `src/screens/NewChallengeScreen.tsx`, `src/screens/FriendsScreen.tsx`, `src/screens/FriendsOnboardingScreen.tsx`, `src/screens/LeaderboardScreen.tsx`

**API:** `friends.ts` (18 routes), `challenges.ts` (5 routes), `social-notifications.ts` (2 routes)

Key routes: `GET /api/friends`, `POST /api/friends/request`, `GET /api/friends/leaderboard/:category`, `GET /api/friends/activity-feed`, `POST /api/friends/cheer/:id`, `GET/POST /api/challenges`

**Data:** `social_connections`, `social_notifications`, `friend_cheers` (migration 044), challenge data (migration 021)

**Status:** Shipped

---

## 15. Insights Engine

**What it does:** Statistical rule engine generating personalized health insights. Full detail (architecture, rule list, statistical methods) is in **[docs/INSIGHT_ENGINE.md](INSIGHT_ENGINE.md)** (if it exists) and `INSIGHT_ENGINE_UPGRADES.md`. Users can dismiss, snooze, pin, undo-dismiss, give feedback, and trigger re-generation. Includes an AI "explain" endpoint and a debug endpoint. Experiments module lets users run structured n-of-1 trials.

**Screens:** `src/screens/InsightsScreen.tsx`, `src/screens/InsightsHistoryScreen.tsx`, `src/screens/InsightsTrendsScreen.tsx`, `src/screens/ExperimentScreen.tsx`

**API:** `insights.ts` (14 routes), `experiments.ts` (5 routes), `analytics.ts` (2 routes — context-correlation, mood)

Key routes: `GET /api/insights`, `POST /api/insights/:id/feedback`, `POST /api/insights/:id/pin`, `POST /api/insights/regenerate`, `GET /api/insights/timeline`, `POST /api/experiments`

**Data:** `user_insights`, `insight_feedback`, `weekly_narratives`, `monthly_narratives`, `insight_engine_state` (migration 045), `user_baselines` (031)

**Services:** `backend/src/services/insightsEngine.ts`, `backend/src/rules/` (50+ rule files), `backend/src/services/causality.ts`

**Status:** Shipped (actively evolving — see `INSIGHT_ENGINE_UPGRADES.md`)

---

## 16. AI Chat

**What it does:** Single streaming POST endpoint powered by Anthropic Claude. The backend injects today's health context (glucose, meals, mood, steps, sleep) into the system prompt before forwarding to Claude. Full conversation history is the client's responsibility.

**Screens:** `src/screens/ChatScreen.tsx`

**API:** `POST /api/chat` (`chat.ts`) — uses `@anthropic-ai/sdk`, streams response

**Data:** No persistence — stateless per request

**External deps:** Anthropic Claude API

**Status:** Shipped

---

## 17. Journal / Mood

**What it does:** Daily journal entries with mood score, emotion vocabulary tags, context JSONB (e.g., social_battery). Mood history exposed via summary routes. Entries drive mood columns in insights correlations.

**Screens:** Embedded in Overview (mood picker), History

**API:**
| Method | Path | File |
|--------|------|------|
| GET | `/api/journal` | `journal.ts` |
| POST | `/api/journal` | `journal.ts` |
| GET | `/api/journal/today` | `journal.ts` |
| GET | `/api/journal/weekly-summary` | `journal.ts` |

**Data:** `journal_entries` (mood, context JSONB, emotion_vocabulary migration 022)

**Status:** Shipped

---

## 18. Weather

**What it does:** Background sync job fetches daily weather (temperature, rain, snow, daylight, cloud cover) from Open-Meteo (free, no API key) for each user who has a lat/lon configured. Weather data feeds Insights Engine rules (`weatherVsMood`, `weatherRainActivity`, `weatherDaylightMood`, `weatherVsExercise`, `weatherTempSleep`). No direct API routes — data is a side input to insights.

**Screens:** `src/screens/settings/WeatherLocationSettingsScreen.tsx`

**API:** None (server-side cron job only — `backend/src/services/weatherSync.ts`)

**Data:** `weather_daily` (migration 047): temp_max, temp_min, rain_hours, snow_mm, daylight_minutes, weather_code, cloud_cover_pct

**External deps:** Open-Meteo API

**Status:** Shipped

---

## 19. Exports & Reports

**What it does:** Generate a PDF doctor report (glucose, sleep, activity, meds summary), a full JSON data export, a weekly-digest PDF, and a trends CSV. Google Drive integration for encrypted backup and restore of full user data.

**Screens:** `src/screens/settings/ExportBackupSettingsScreen.tsx`

**API:**
| Method | Path | File |
|--------|------|------|
| GET | `/api/export/doctor-report` | `export.ts` |
| GET | `/api/export/all` | `export.ts` |
| GET | `/api/export/weekly-digest.pdf` | `export.ts` |
| GET | `/api/export/trends.csv` | `export.ts` |
| GET | `/api/settings/google-drive/status` | `google-drive.ts` |
| POST | `/api/settings/google-drive/backup` | `google-drive.ts` |
| POST | `/api/settings/google-drive/restore` | `google-drive.ts` |
| GET | `/api/settings/google-drive/list-backups` | `google-drive.ts` |

**External deps:** Google Drive API, pdfkit (or similar PDF lib)

**Status:** Shipped

---

## 20. Watch Tiles / Home-Screen Widgets

**What it does:** Widget tokens (scope-restricted JWTs, 7-day expiry) are issued from `GET /api/auth/widget-token`. The Android home-screen widget reads a plain file (not SecureStore, which is inaccessible from widget process) and calls a restricted set of endpoints. `WatchTilesScreen` lets users configure which metrics appear.

**Screens:** `src/screens/WatchTilesScreen.tsx`

**API:** `GET /api/auth/widget-token` — issues restricted JWT. Widget-allowed endpoints enforced in `backend/src/middleware/auth.ts` (`isWidgetAllowed`). `WIDGET_GET_PREFIXES` now includes `/api/health-connect/sleep/stats`.

**Watch breathing activity** (`plugins/wear-tile/RippleWearBreathingActivity.kt`): redesigned with full-face layout. BoxAnimView draws a square-perimeter animation for BOX pace. Ripple animations added: phase-transition rings, trail echo, ambient picker ripples, completion burst, box corner pulses. Tile text fixes applied. Widget sleep was 404ing on wrong path — fixed in `RippleWidgetProvider.kt`. **These are native changes; they take effect in the next build.**

**Watch swipeable insights** (2026-08): the wear main activity's insight section is a ViewFlipper — the phone pushes up to 5 insight titles joined by U+2063 in a new `insights` data-map field (`RippleWidgetProvider.kt` → `WearDataBridge.kt.template` → `WearDataListenerService.kt` → `WearCache.kt`; legacy single `insight` field kept for older watches). `RippleWearMainActivity.kt` renders them with horizontal fling gestures and a "1 / N" counter, falling back to the single insight when no separator is present. **Native change; effective in the next build.**

**App→watch sync trigger** (2026-08): previously the watch only received data when a pinned home-screen widget refreshed — no widget meant no steps/sleep on the watch, and in-app water logs never reached it. Now a local Expo module (`modules/ripple-widget-sync/`, JS wrapper `src/lib/widgetSync.ts` → `syncWidgetAndWatch()`) broadcasts `WIDGET_WEAR_SYNC` to `RippleWidgetProvider`, which refetches metrics and pushes to the watch even with zero pinned widgets. Called after every water log (Health/Overview/WatchTiles screens) and at the end of `syncHealthData()`. `RippleWearMainActivity` also gained deeper top/bottom padding on round screens (`isScreenRound`) so the "Ripple" title isn't clipped by the bezel. **Native change; effective in the next build.**

**Watch/widget polish wave** (2026-08): urgent-glucose wrist haptic (double buzz, 15-min debounce), "Updated X" timestamp + mood row + water progress arc on the watch home screen, mood field in the phone→watch push, "phone not reachable" feedback on watch logging (no more silent dropped logs), breathing screen auto-dims after 60 s, widget mood-trend dot strip. **Native; next build.**

**Widget review wave** (2026-08-24): full widget audit fixes — backup refresh alarm, goAsync ANR guard, per-instance PendingIntents, deduped fetches, connection cleanup, score-card tap-to-advance; new: exercise minutes on steps chip, meal kcal in meal chip, mindfulness streak badge, urgent-glucose ⚠ label, breathe button, water/mood log toasts; a11y contentDescriptions throughout, dark-mode color fix on compact widget, water chips deeplink to the water screen. **Native; next build.**

**Watch bug-fix wave** (2026-08-29): four watch bugs fixed — (1) sleep fetch on the widget now uses an 8-second timeout (was 3 s) so the multi-query `/health-connect/sleep/stats` endpoint doesn't time out and return blank; (2) watch mood logging via `WearMessageListener` was posting to the non-existent `/api/mood-log` route — corrected to `POST /api/journal`; (3) the widget-scoped JWT did not allow `POST /api/journal`, so watch mood logs were rejected 403 — added `/api/journal` to the widget POST allowlist in `backend/src/middleware/auth.ts`; (4) `WearMessageListener` was creating fallback water metrics named "Water" (capital) while the `/api/metrics/water/today` query uses `lower(m.name) = 'water'` — the create call now uses lowercase "water" with the correct `unit`/`color_key` fields, and the backend query was updated to use `lower()` for resilience. Also added `/ripple/breath-session` to the `WearMessageListener` AndroidManifest intent-filter so breathing sessions are routed to the listener. **Native + backend change; native takes effect in the next build.**

**Data:** No separate table — token carries `user_id`

**Status:** Partial (Android widget shipped; WearOS complication planned)

---

## 21. Search

**What it does:** Global search across glucose readings, meals, mood entries, spending transactions, and a catch-all across all domains.

**Screens:** `src/screens/GlobalSearchScreen.tsx`

**API:** `search.ts` — `GET /api/search/glucose`, `/meals`, `/mood`, `/spending`, `/global`

**Status:** Shipped

---

## 22. Demo Mode

**What it does:** When `DEMO_LOGIN_ENABLED=1` (dev env only), entering "demo" as the email bypasses password check and logs in as `demo@ripple.test`. The production demo account has a scrambled password so this path cannot be used against prod. Seed data policy documented in `project_demo_seed.md`.

**Screens:** `src/screens/LoginScreen.tsx`

**API:** `POST /api/auth/login` (env-gated shortcut inside `auth.ts`)

**Status:** Shipped (dev-only gate)

---

## 23. Admin

**What it does:** Secret-key-gated endpoints for ops use. Slow-query inspection via `pg_stat_statements`. Health summary endpoint for monitoring.

**API:**
| Method | Path | File |
|--------|------|------|
| GET | `/api/admin/perf` | `admin.ts` |
| GET | `/api/admin/health-summary` | `admin.ts` |

**Auth:** `x-admin-secret` header (constant-time compare)

**Status:** Shipped

---

## 24. Settings & Preferences

**What it does:** User settings stored in `users.settings` JSONB. Tab preferences (which tabs are visible, order). Feature hints dismissed tracking. Media uploads (profile images, card image splitter). Error reporting. Customizable dashboard blocks.

**Screens:** `src/screens/SettingsScreen.tsx`, `src/screens/TabPreferencesScreen.tsx`, `src/screens/CustomizeDashboardScreen.tsx`, `src/screens/CardImageSplitterScreen.tsx`, `src/screens/HelpScreen.tsx`, `src/screens/settings/` (15 sub-screens listed below)

**Settings sub-screens:**
| Screen | Route | What it does |
|--------|-------|-------------|
| `AppearanceSettingsScreen.tsx` | `"SettingsAppearance"` | **Theme Studio** — select color palettes, theme families, adjust card opacity/glass blur |
| `SecuritySettingsScreen.tsx` | `"SettingsSecurity"` | **App Lock** — toggle biometric unlock (fingerprint / face ID); requires auth after 5 min background |
| `NotificationsSettingsScreen.tsx` | `"SettingsNotifications"` | Smart notification toggles per category, health notification toggles, mute-until controls, weekly recap nudge |
| `TrackingSettingsScreen.tsx` | `"SettingsTracking"` | **Always-on tracking** — Android foreground service that keeps Health Connect sync alive continuously |
| `PreferencesSettingsScreen.tsx` | `"SettingsPreferences"` | Week start day (per-section: finance, exercise, steps, etc.) |
| `SocialSettingsScreen.tsx` | `"SettingsSocial"` | Friend sharing preferences and social notification opt-ins |
| `FeatureGuideScreen.tsx` | `"SettingsFeatureGuide"` | Guided walkthroughs of app features |
| `HealthConnectSettingsScreen.tsx` | `"SettingsHealthConnect"` | Grant/revoke Health Connect permissions; Samsung Health setup card |
| `DexcomSettingsScreen.tsx` | `"SettingsDexcom"` | Dexcom Share credential setup |
| `MedicationRemindersScreen.tsx` | `"MedicationReminders"` | Medication dose reminders |
| `ExportBackupSettingsScreen.tsx` | `"SettingsExportBackup"` | Export & backup (see section 19) |
| `BanksSettingsScreen.tsx` | `"SettingsBanks"` | Connected Plaid bank accounts |
| `HardcoverSettingsScreen.tsx` | `"SettingsHardcover"` | Hardcover API token setup |
| `WeatherLocationSettingsScreen.tsx` | `"SettingsWeatherLocation"` | Set lat/lon for weather sync |

**Help & FAQ** (`src/screens/HelpScreen.tsx`, route `"Help"`): collapsible FAQ sections covering all major feature areas.

**Feature Guide subscreen:** Feature Guide entries have been moved out of SettingsScreen into a dedicated subscreen `src/screens/settings/FeatureGuideScreen.tsx` (route `"SettingsFeatureGuide"`). SettingsScreen now shows a single "Feature Guide" row that navigates to it.

**HealthConnectSettingsScreen:** the grant-permissions and open-settings buttons now call `openHealthConnectSettings()` from `react-native-health-connect` directly, fixing a previous silent no-op that was using a manual intent string. Additional HC permission flow fixes: grant-permission call now `await`s dialog resolution before re-checking granted state (fixes stuck "permissions needed" screen); revoking permissions in-app calls `resetHCInitialized()` so the HC client reinitializes on next use and the UI self-heals to "permissions needed" state rather than showing a broken sync.

**API:**
| Method | Path | File |
|--------|------|------|
| GET/PUT | `/api/settings` | `settings.ts` |
| PATCH | `/api/settings/...` | `settings.ts` |
| GET/PUT | `/api/user/tab-preferences` | `tab-preferences.ts` |
| GET/POST | `/api/hints/:key` | `hints.ts` |
| POST | `/api/media/upload` | `media.ts` |
| POST | `/api/errors` | `error-reports.ts` |

**Data:** `users.settings` JSONB, `feature_hints_dismissed`, `media_assets` (migration 035)

**Status:** Shipped

---

## 25. Offline Sync Queue

**What it does:** Idempotent offline-write buffer. Failed writes to queueable endpoints are stored in SQLite (`ripple_sync.db`) by the mobile client. On reconnect / foreground resume, the mobile app drains the queue via `POST /api/sync/batch`. The backend checks the `sync_log` table (keyed by `(user_id, sync_id)`) to detect already-processed items and deduplicates silently.

**API:**
| Method | Path | File |
|--------|------|------|
| POST | `/api/sync/batch` | `sync.ts` |

**Data:** `sync_log` (migrations 003, 036) — `(sync_id, user_id, processed_at)`; rows TTL-cleaned nightly at 4 AM EST.

**Status:** Shipped

---

## Planned / Ideas

Items carried forward from `FEATURE_IDEAS.md` that are **not** yet shipped:

### Health Intelligence
- **Sleep debt counter** — ✅ shipped (`SleepDetailScreen.tsx`): rolling 7-day sleep debt bar graph, deficit hours, color-coded by severity (green < 2h, yellow < 5h, red ≥ 5h), empty state when no data
- **Heart rate zones** — ✅ shipped (time-in-zones on HeartRateDetailScreen)
- **Resting HR trend chart** — ✅ shipped (30-day trend + 7-day rolling avg on HeartRateDetailScreen)
- **Glucose variability index** — coefficient of variation alongside average
- **Menstrual cycle phase overlays** on glucose and mood charts
- **Stress proxy** — HRV-estimated stress indicator (low/med/high)
- **Hydration reminders tied to activity level**
- **Symptom journal** — quick-log symptoms; correlate with food/glucose/sleep

### Meals
- **Quick-log from history** — one-tap repeat of a recent meal
- *(Fasting timer — ✅ shipped; `FastingTimerCard` on Overview; milestone notification labels (12h/16h/24h) shown in UI; notification scheduling recently shipped — see section 2)*
- **Meal photo log** — attach photo to entry; gallery in history
- **Net carb toggle** — total carbs minus fiber display option
- **Calorie goal with macro split** — daily target + progress ring
- **Weekly nutrition report** — average macros per day

### Finance
- **Spending forecast** — "at this rate you'll spend $X by month end"
- **Savings goal tracker** — target amount + deadline + progress bar
- **Subscription detector** — identify recurring charges
- **Cash envelope mode** — per-category spending locks

### Life / Habits
- **Habit heatmap** — GitHub-style grid for any habit (12-week view)
- **Annual reading goal** — books-per-year target with pace indicator
- **Life areas balance wheel** — radar chart: Health / Finance / Learning / Social / Mindfulness
- **Hobby time tracking** — log duration per session; weekly hours-per-hobby

### Social / Gamification
- **Group challenges** — 3+ friends on the same metric
- *(Kudos / reactions — shipped as cheers: `friend_cheers` table, `POST /api/friends/cheer/:id`; see section 14)*
- **Team challenges** — aggregate step count across two teams
- **Rival mode** — pick one friend; show their stats alongside yours

### Smart Alerts / Notifications
- **Bedtime nudge** — based on sleep target + usual wake time
- **Glucose cliff warning** — fast-drop notification before hitting low threshold
- **Medication window** — PRN "last taken X hours ago" alert near safe re-dose window
- **Low streak danger nudge** — if nothing logged by 9pm and streak at risk

### UX / Platform
- **Home-screen 4×2 widget** — glucose + steps + mood + streak
- **WearOS complication** — current glucose or steps on watch face
- **Siri / Google Assistant shortcuts** — "log water", "what's my glucose"
- **Data import wizard** — Apple Health / Google Fit / Cronometer / MyFitnessPal CSV
- *(Export to PDF health summary — shipped as `/api/export/doctor-report` and `/api/export/weekly-digest.pdf`; see section 19)*
- **Dark mode OLED theme** — true black backgrounds

### Integrations
- **Oura Ring** — import sleep stages, HRV, readiness score
- **Garmin / Fitbit** — alternative to Health Connect
- **YNAB sync** — two-way spending category sync
- **Strava** — auto-import workouts

### Monetization / Growth
- **Premium tier** — extended Trends history, advanced correlations, custom metrics
- **Coach mode** — read-only dashboard for a dietitian or trainer
- **Referral program** — share code; both users get streak freeze or premium week
