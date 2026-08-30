# Ripple Wellness — Backend Master Reference

> Living document — update whenever backend architecture, routes, jobs, env vars, or deploy procedure change.

---

## 1. Architecture Overview

**Runtime:** Node 20+, TypeScript via `tsx watch` (dev) / `tsc` + `node dist/` (prod).  
**Framework:** Fastify with `trustProxy: true` (Caddy sets X-Forwarded-For in prod).

### Plugin / middleware stack (registration order)

1. `@fastify/cors` — allows `https://app.kels.gg`, `http://localhost:*`, `http://129.121.125.214:*`.
2. `@fastify/helmet` — CSP disabled (only HTML served is the inline admin media tool).
3. `@fastify/rate-limit` — global 300 req/min; key = `Authorization` header value (per-user bucket) or IP for anonymous. Chat route overrides to **20 req/min** via `config.rateLimit`.
4. `onRequest` hook — runs `requireAuth` on every route except `PUBLIC_PREFIXES`.
5. Custom JSON body parser — treats empty body as `{}`; preserves `req.rawBody` for Plaid webhook signature verification.
6. Global error handler — forwards 4xx errors with their message; logs 5xx internally and returns a generic `"Internal server error"`.

### Auth model (`src/middleware/auth.ts`)

- **Standard JWT** — 30-day expiry, signed with `JWT_SECRET`, payload `{ user_id, tv }`.
- **Token revocation** — every request checks `users.token_version` against the `tv` claim. A mismatch (e.g. after password change) immediately rejects the token. The DB value is cached in-process for 30s (`middleware/auth.ts`); routes that bump `token_version` call `invalidateTokenVersionCache(userId)` so revocation is immediate on the same instance.
- **Per-route rate limits** — expensive endpoints carry their own limits on top of the global bucket: export `/all`, `/doctor-report`, `/weekly-digest.pdf` and insights `/regenerate` at 2/min; insights `/impact/:rule_id` at 30/min.
- **Widget tokens** — 7-day expiry, payload `{ user_id, scope: "widget" }`. Restricted to GET on a fixed set of read endpoints plus POST `/api/metrics` and `/api/metrics/:id/logs` (water logging from the Android home-screen widget, which cannot access SecureStore).
- **Download tokens** — 5-minute, single-use, passed as `?dl=` query param for URL-based file downloads (keeps JWT out of logs and browser history).

### Public prefixes (no auth required)

```
/health
/api/auth
/auth/dexcom
/auth/google
/api/plaid/webhook
/api/medications/import/template
/admin/media
```

---

## 2. Route Map

| Prefix | File | Purpose |
|--------|------|---------|
| `GET /health` | server.ts | Liveness probe — returns `{ ok: true }` |
| `GET /admin/media` | server.ts / admin/media-admin.html | Static single-page media management tool |
| `/api/auth` | routes/auth.ts | Register, login, logout, change password, widget token |
| `/api/admin` | routes/admin.ts | Admin-only operations (ADMIN_SECRET required) |
| `/auth/dexcom` | routes/dexcom-auth.ts | Dexcom OAuth v3 callback flow |
| `/api/dexcom` | routes/dexcom-verify.ts | Verify Dexcom Share credentials |
| `/auth/google` | routes/google-auth.ts | Google OAuth callback flow |
| `/api/books-search` | routes/books-search.ts | Proxy search to Hardcover / external book APIs |
| `/api/food` | routes/food.ts | Nutrition lookup via Passio / USDA FDC |
| `/api/metrics` | routes/metrics.ts | Generic metric definitions and log entries; `GET /:id/weekly-total` returns `{ week_total, last_week_total, month_to_date_total }` (honors `week_start_day`); `POST /:id/logs/batch` inserts up to 100 `{ value, logged_at?, note? }` entries in one multi-row INSERT (used by Health Connect sync) |
| `/api/books` | routes/books.ts | User book library and reading logs |
| `/api/hobbies` | routes/hobbies.ts | Hobby definitions and session logs |
| `/api/meals` | routes/meals.ts | Meal log (macros, calories, barcode lookup) |
| `/api/glucose` | routes/glucose.ts + glucose-status.ts | CGM readings and real-time status widget |
| `/api/spending` | routes/spending.ts | Manual spending entries |
| `/api/plaid` | routes/plaid.ts | Plaid Link token, exchange, webhook, transactions |
| `/api/journal` | routes/journal.ts | Journal entries with mood scores |
| `/api/summary` | routes/summary.ts | Daily summary reads |
| `/api/chat` | routes/chat.ts | Anthropic-backed wellness assistant (20 req/min) |
| `/api/health-connect` | routes/health-connect.ts | Android Health Connect ingest (steps, sleep, HR, exercise, weight, SpO₂); `/sleep/stats` extended with `week_avg_seconds`, `last_week_avg_seconds`, `bedtime_spread_mins`; also in `WIDGET_GET_PREFIXES` |
| `/api/heart-rate` | routes/heart-rate.ts | Heart rate history and stats; `GET /api/heart-rate/stats` returns 30-day resting trend, 7-day rolling avg, week comparison, time-in-zones; `GET /api/heart-rate/daily` returns the last N days that have data (not NOW-anchored) using `PERCENTILE_CONT(0.05)` for resting HR |
| `/api/settings` | routes/settings.ts | User settings CRUD |
| `/api/settings/google-drive` | routes/google-drive.ts | Google Drive backup enable/trigger |
| `/api/export` | routes/export.ts | CSV/JSON health data export |
| `/api/search` | routes/search.ts | Cross-domain search |
| `/api/substances` | routes/substances.ts | Substance (alcohol, caffeine) logs |
| `/api/completed` | routes/completed.ts | Daily habit completion tracking |
| `/api/sync` | routes/sync.ts | Mobile offline sync queue |
| `/api/analytics` | routes/analytics.ts | Correlation and trend analytics |
| `/api/insights` | routes/insights.ts | AI-generated pattern insights (view, dismiss, feedback); `GET /insights/categories` returns active counts grouped by type |
| `/api/recipes` | routes/recipes.ts | Saved meal recipes |
| `/api/annotations` | routes/annotations.ts | Chart annotations |
| `/api/user/tab-preferences` | routes/tab-preferences.ts | Per-user home tab ordering |
| `/api/exercise` | routes/exercise.ts + programs.ts | Workout logs and training programs |
| `/api/medications` | routes/medications.ts | Medication definitions and import template |
| `/api/medication-doses` | routes/medication-doses.ts | Dose log entries |
| `/api/medications/categories` | routes/medication-categories.ts | Medication categories |
| `/api/medications/prescribers` | routes/medication-prescribers.ts | Prescriber records |
| `/api/cycle` | routes/cycle.ts | Menstrual cycle tracking |
| `/api/dashboard` | routes/dashboard.ts | Aggregated dashboard data |
| `/api/hints` | routes/hints.ts | Onboarding hint state |
| `/api/mindfulness` | routes/mindfulness.ts | Mindfulness session logs and stats |
| `/api/media` | routes/media.ts | Media asset upload / management |
| `/api/errors` | routes/error-reports.ts | Client-side error reporting |
| `/api/experiments` | routes/experiments.ts | Feature flag experiments |
| `/api/friends` | routes/friends.ts | Friend connections |
| `/api/challenges` | routes/challenges.ts | Shared wellness challenges |
| `/api/social-notifications` | routes/social-notifications.ts | In-app social notifications |
| `/api/hardcover` | routes/hardcover.ts | Hardcover reading sync |
| `POST /api/download-token` | server.ts | Mint a 5-min single-use download token |

---

## 3. Background Jobs / Schedulers

All jobs are scheduled via `node-cron` in `server.ts` after the HTTP server starts.

**Process timezone is EST**: the `dev`/`start` scripts in `backend/package.json` set `TZ=America/New_York`, so all JS-side `new Date()` day logic matches the DB session timezone (also America/New_York) and the cron schedules. The frontend buckets dates in the device's local timezone.

| Job | Schedule | File | Notes |
|-----|----------|------|-------|
| Daily Summary Engine (refresh today) | Every 30 min + startup | `jobs/dailySummaryJob.ts` | Seeds `daily_summaries` for today; **pg advisory lock** prevents overlap |
| Daily Summary Engine (finalize yesterday) | 1:00 AM EST daily | `jobs/dailySummaryJob.ts` | Passes EST yesterday's date explicitly; `timezone: "America/New_York"` |
| Insights Engine | 3:00 AM EST daily + 15 s after boot | `jobs/insightsJob.ts` | `timezone: "America/New_York"`; **pg advisory lock** prevents overlap; runs 15 s after boot so summaries seed first |
| Dexcom Share sync | Every 5 min + startup | `jobs/dexcom-share-sync.ts` | Skipped entirely if `DEXCOM_SHARE_DISABLED=1` |
| sync_log TTL cleanup | 4:00 AM EST daily | server.ts (inline) | `timezone: "America/New_York"`; deletes rows older than 30 days |
| Google Drive backup | 2:00 AM EST daily | `jobs/google-drive-backup.ts` | `timezone: "America/New_York"`; only scheduled if `GOOGLE_CLIENT_ID` is set; iterates all connected users |
| Hardcover two-way sync | Every 4 hours | `jobs/hardcover-sync.ts` | All users with Hardcover connected; **pg advisory lock** prevents overlap |
| Weather sync | 6:00 AM EST daily + startup | `services/weatherSync.ts` | `timezone: "America/New_York"`; Open-Meteo (keyless); backfills 90 days on first run per user |

---

## 4. Database

### Connection (`src/db.ts`)

- `pg.Pool` via `DATABASE_URL`, pool size 20, idle timeout 10 s, connect timeout 5 s, statement timeout 30 s.
- **Timezone forced to `America/New_York`** via connection option `-c timezone=America/New_York` — all `TIMESTAMPTZ` comparisons in queries run in EST.

### Schema overview

`schema.sql` defines the original tables. Subsequent migrations (numbered `NNN_*.sql` in `backend/migrations/`) extend and evolve them. Group by domain:

| Domain | Key tables |
|--------|-----------|
| Auth / users | `users` (id, email, token_version), `user_settings` (jsonb settings blob) |
| Daily rollup | `daily_summaries`, `daily_summary` (legacy) |
| Generic metrics | `metrics`, `metric_logs` |
| Health data | `heart_rate_readings`, `sleep_sessions`, `glucose_readings`, `dexcom_share_sessions` |
| Food | `meals`, `recipes`, `meal_templates` |
| Books / reading | `books`, `reading_logs` |
| Hobbies | `hobbies`, `hobby_logs` |
| Journal / mood | `journal_entries` |
| Exercise | `exercise_logs`, `workout_programs`, `program_sessions` |
| Medications | `medications`, `medication_doses`, `medication_categories`, `medication_prescribers` |
| Finance | `spending_entries`, `plaid_items`, `plaid_transactions` |
| Substance tracking | `substance_logs` |
| AI / insights | `user_insights`, `insight_feedback`, `weekly_narratives`, `monthly_narratives`, `user_baselines`, `insight_rule_runs` (one row per evaluated rule per run — `fired` boolean; enables hit-rate computation as `SUM(fired)/COUNT(*)`), `insight_engine_state`, `insight_global_priors` |
| Social | `friends`, `challenges`, `social_notifications` |
| Streaks | `streak_freezes` — one row per freeze used: `user_id`, `freeze_month` (first day of month), `applied_to_date` (missed day covered), `streak_type` (e.g. `'mindfulness'`, `'logging'`, `'exercise'`); unique on `(user_id, freeze_month, streak_type)`; queried by `summary.ts` streak endpoint to check/grant/apply freezes |
| Misc | `sync_log`, `chart_annotations`, `experiments`, `error_reports`, `media_assets`, `hobbies` (completed_at added mig 037), `tab_preferences`, `mindfulness_sessions`, `cycle_entries` |

### Migration workflow

Migrations live in `backend/migrations/NNN_*.sql` (currently 001–052). They are applied **manually** — the DATABASE_URL password contains special characters that break psql URL parsing, so use the explicit form:

```bash
sudo -u postgres psql wellness_multiuser < backend/migrations/NNN_name.sql
# and always also apply to dev:
sudo -u postgres psql wellness_multiuser_dev < backend/migrations/NNN_name.sql
```

There is no auto-migration runner; check the highest numbered file to find the current schema version.

### Migrations 042–052 (audit-fix pass)

| # | File | Summary |
|---|------|---------|
| 042 | `042_insights_snooze.sql` | Adds `snoozed_until` column to `user_insights`; insights hidden when `snoozed_until > NOW()` |
| 043 | `043_dexcom_share_sessions.sql` | Adds `dexcom_share_sessions` table — persists Dexcom Share session IDs across restarts to avoid rate-limit lockouts |
| 044 | `044_friend_cheers.sql` | Adds `friend_cheers` table — one-tap cheer per friend per day (streak cheers feature) |
| 045 | `045_insight_engine_state.sql` | Adds `insight_engine_state` table — per-user `latest_frame_date` watermark for incremental engine skipping |
| 046 | `046_token_version_and_indexes.sql` | Adds `token_version` column to `users` (JWT revocation) + performance indexes on `exercise_sessions` and other tables |
| 047 | `047_weather_daily.sql` | Adds `weather_daily` table — daily weather per user (temp, rain, daylight, cloud cover) for weather insight rules |
| 048 | `048_monthly_narratives.sql` | Adds `monthly_narratives` table — cached LLM-generated monthly narrative per user per month |
| 049 | `049_composite_user_time_indexes.sql` | Composite `(user_id, time_col)` indexes on several tables lacking covering indexes for range queries |
| 050 | `050_metrics_unique_user_name.sql` | De-dupes existing `metrics` rows (repointing logs to the lowest-id keeper) then adds a `UNIQUE INDEX` on `(user_id, name)` — enforces at DB level that each user can only have one metric per name |
| 051 | `051_hobby_and_dose_log_indexes.sql` | Adds `idx_hobby_logs_hobby_id (hobby_id, logged_at DESC)` and `idx_dose_logs_med_date (medication_id, log_date, status)` — covering indexes for hobby-streak and medication-adherence queries |
| 052 | `052_streak_freezes.sql` | Adds `streak_freezes` table — records one streak freeze used per user per month per streak type; unique index on `(user_id, freeze_month, streak_type)` prevents double-use |

---

## 5. Environments & Deploy

### Environment table

| | Production | Dev |
|--|------------|-----|
| Directory | `/root/wellness-app-multiuser` | `/root/wellness-app-multiuser-dev` |
| Git branch | `master` | `dev` |
| Backend port | 4001 | 4002 |
| Database | `wellness_multiuser` | `wellness_multiuser_dev` |
| Screen session | `wellness-prod` | `wellness-dev` |
| Log file | `/tmp/prod-backend.log` | `/tmp/dev-backend.log` |
| Public URL | `https://app.kels.gg` (Caddy → 4001) | `http://129.121.125.214:4002` |

Note: `/root/wellness-app-multiuser` is a **git worktree** of the dev repo, tracking `master`. Never `git checkout master` inside the dev directory — use the worktree directory for all master-branch operations.

### Deploy procedure

1. Do all work in `/root/wellness-app-multiuser-dev` on the `dev` branch.
2. Commit and push `dev` to **both** remotes:
   - `origin` = `kellehsm/ripple-health-backend-multiuser`
   - `frontend` = `kellehsm/ripple-health-multiuser`
3. Merge into master (no-ff merge-commit style):
   ```bash
   cd /root/wellness-app-multiuser
   git merge dev -m "Merge dev: <description>"
   git push origin master
   git push frontend master
   ```
4. Apply any new migrations to prod DB:
   ```bash
   sudo -u postgres psql wellness_multiuser < backend/migrations/NNN_name.sql
   ```
5. Restart prod backend:
   ```bash
   screen -S wellness-prod -X quit
   screen -dmS wellness-prod bash -c 'cd /root/wellness-app-multiuser/backend && npm run dev 2>&1 | tee /tmp/prod-backend.log'
   ```
6. Verify: `curl https://app.kels.gg/health` must return `{"ok":true}`.

**NEVER merge to master or restart prod without explicit user approval.**

---

## 6. External Integrations

### Anthropic (Claude)

- **Purpose:** AI wellness assistant (chat) and nightly insights narrative generation.
- **Files:** `routes/chat.ts` (model `claude-sonnet-4-6`, 14-day context window, 30 msg cap), `jobs/insightsJob.ts`.
- **Env vars:** `ANTHROPIC_API_KEY`

### Dexcom Share (follower stream)

- **Purpose:** Poll CGM readings every 5 min for users who have configured Share credentials.
- **Files:** `jobs/dexcom-share-sync.ts`
- **Details:** Authenticates via `POST /General/LoginPublisherAccountById` (public Dexcom Share app ID: `d8665ade-9673-4e27-9ff6-92db4ce13d13`). Sessions cached in `dexcom_share_sessions` table (23-hour TTL). Timestamps arrive as `"Date(1691455258000)"` — **no leading slash** — parsed accordingly. Passwords stored encrypted (`enc:v1:` prefix) using `CRED_ENCRYPTION_KEY`.
- **Env vars:** `DEXCOM_SHARE_REGION`, `DEXCOM_SHARE_DISABLED` (set to `1` in dev to prevent double-logging against prod accounts)

### Dexcom OAuth (API v3)

- **Purpose:** Full OAuth flow for users connecting their own Dexcom account directly.
- **Files:** `routes/dexcom-auth.ts`, `routes/dexcom-verify.ts`
- **Env vars:** `DEXCOM_CLIENT_ID`, `DEXCOM_CLIENT_SECRET`, `DEXCOM_REDIRECT_URI`, `DEXCOM_API_BASE`

### Plaid

- **Purpose:** Bank/credit card transaction ingestion for spending tracking.
- **Files:** `routes/plaid.ts`
- **Details:** Webhook signature verified using raw request body (`req.rawBody`). Access tokens stored encrypted in `plaid_items`. `syncTransactionsForItem` commits each page's upserts and cursor advance atomically in a single transaction — a crash resumes from the last completed page rather than reprocessing from scratch. Webhook sync errors are logged (previously silently swallowed).
- **Env vars:** `PLAID_CLIENT_ID`, `PLAID_SANDBOX_SECRET`, `PLAID_PRODUCTION_SECRET`, `PLAID_ENV`, `PLAID_ANDROID_PACKAGE_NAME`

### Google (OAuth + Drive)

- **Purpose:** OAuth login option; optional nightly Drive backup of user data exports.
- **Files:** `routes/google-auth.ts`, `routes/google-drive.ts`, `jobs/google-drive-backup.ts`
- **Details:** Drive backup only runs if `GOOGLE_CLIENT_ID` is set. Iterates all users where `user_settings.settings->'google_drive'->>'connected' = 'true'`.
- **Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### Passio / USDA FDC

- **Purpose:** Nutritional data lookup for meal logging (barcode scan and text search).
- **Files:** `routes/food.ts`
- **Env vars:** `PASSIO_API_KEY`, `USDA_FDC_API_KEY`

### Hardcover

- **Purpose:** Two-way sync of reading progress and book library with Hardcover.app.
- **Files:** `routes/hardcover.ts`, `jobs/hardcover-sync.ts`, `routes/books-search.ts`
- **Details:** API token stored encrypted per user in `user_settings`. Syncs every 4 hours.
- **Env vars:** `HARDCOVER_API_KEY` (server-level key for search; per-user tokens stored in DB)

### Open-Meteo

- **Purpose:** Historical and forecast weather data correlated with wellness metrics.
- **Files:** `services/weatherSync.ts`
- **Details:** No API key required. Backfills 90 days on first run per user.
- **Env vars:** none

---

## 7. Environment Variables

All vars from `backend/.env.example`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string — **required at startup** |
| `PORT` | HTTP listen port (default 4000; prod uses 4001, dev 4002) |
| `NODE_ENV` | `production` or `development` — gates several safety checks |
| `JWT_SECRET` | HMAC key for all JWTs — **required at startup** |
| `ADMIN_SECRET` | Secret for admin-only endpoints |
| `CRED_ENCRYPTION_KEY` | AES-256-GCM key for stored credentials (Dexcom password, Hardcover token, Plaid token) — **fatal if absent in production** (startup exits); in dev, logs a warning and credentials remain plaintext |
| `DEMO_LOGIN_ENABLED` | Set `true` to enable the shortcut demo login (prod: off; password also scrambled separately) |
| `DEMO_PASSWORD` | Password accepted for the demo login shortcut; fallback `"Ripple2026"`. Only active when `DEMO_LOGIN_ENABLED=1` **and** `NODE_ENV !== 'production'` (`auth.ts` line 23) |
| `ANTHROPIC_API_KEY` | Enables AI chat and insights narrative; chat returns 503 if absent |
| `PASSIO_API_KEY` | Passio nutrition API |
| `USDA_FDC_API_KEY` | USDA FoodData Central API |
| `HARDCOVER_API_KEY` | Hardcover book search API |
| `PLAID_CLIENT_ID` | Plaid API client ID |
| `PLAID_SANDBOX_SECRET` | Plaid sandbox secret |
| `PLAID_PRODUCTION_SECRET` | Plaid production secret |
| `PLAID_ENV` | `sandbox` or `production` |
| `PLAID_ANDROID_PACKAGE_NAME` | Android package name for Plaid Link on mobile |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID; also gates the Drive backup cron |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI |
| `DEXCOM_CLIENT_ID` | Dexcom OAuth v3 client ID |
| `DEXCOM_CLIENT_SECRET` | Dexcom OAuth v3 client secret |
| `DEXCOM_REDIRECT_URI` | Dexcom OAuth redirect URI |
| `DEXCOM_API_BASE` | Dexcom API base URL (`https://sandbox-api.dexcom.com` or prod) |
| `DEXCOM_SHARE_ACCOUNT_ID` | Dexcom Share account username (email); read by `jobs/dexcom-share-sync.ts` |
| `DEXCOM_SHARE_ACCOUNT_NAME` | Dexcom Share display/account name used when logging in via `loginWithName`; read by `jobs/dexcom-share-sync.ts` alongside `DEXCOM_SHARE_ACCOUNT_ID` |
| `DEXCOM_SHARE_PASSWORD` | Dexcom Share account password; stored encrypted in `user_settings` after first sync |
| `DEXCOM_SHARE_REGION` | `us` or `ous` (outside US) for Share endpoint selection |
| `DEXCOM_SHARE_DISABLED` | Set `1` or `true` to skip the Share polling cron entirely |
| `API_BASE_URL` | Internal base URL for jobs/webhooks calling back into the API |

---

## 8. Hard Rules

- **Never log or expose credential values.** The Dexcom Share sync explicitly passes only `{ err, user_id }` to the logger — never the `dexcom` settings object, which contains `share_password`.
- **Week-start boundary reads `user_settings`.** Week-start day (Monday vs Sunday) is a per-user setting. Never hardcode either day — always read `user_settings` for the current user.
- **Check the DB before assuming a feature is broken.** Multiple "this doesn't work" reports have been working backend logic with no UI wiring. Verify rows exist in the relevant table first.
- **Demo accounts are locked down in prod.** The demo user password is scrambled in the production DB. The shortcut demo login is env-gated (`DEMO_LOGIN_ENABLED`) **and hard-disabled when `NODE_ENV=production`** — the env gate check is a compile-time guard, not just a runtime config. Never re-enable either without explicit instruction.
- **`CRED_ENCRYPTION_KEY` is fatal in production.** Server exits on startup if missing when `NODE_ENV=production`. In dev it only warns.
- **change-password invalidates all other sessions.** `POST /api/auth/change-password` bumps `users.token_version` and returns a fresh token — existing tokens on other devices become invalid immediately.
- **Admin routes rate-limit failed secret attempts.** `routes/admin.ts` enforces a maximum of 5 failed `x-admin-secret` attempts per IP per 15 minutes (in-memory bucket).
- **Search input length capped at 200 chars.** `routes/search.ts` rejects `q` or `category` values longer than 200 characters with HTTP 400.
- **`/export/all` uses explicit column lists.** The full-data export avoids `SELECT *` — each table is queried with an explicit column list to prevent accidental credential leakage if schema changes.
- **`/export/all` streams.** Tables are queried sequentially and written incrementally to `reply.raw` (same JSON shape) instead of buffering the whole export in memory. `routes/sync.ts` no longer runs startup DDL — `sync_log` schema is fully owned by migrations 003 + 036.
- **No per-item secrets in responses.** Encrypted credentials (`enc:v1:*`) must never be returned in API responses. Decrypt server-side only when needed for outbound calls.
- **On startup, a credential sweep runs automatically.** Any plaintext Dexcom passwords, Hardcover tokens, or Plaid access tokens found in the DB are encrypted in place. This is idempotent and fast once everything is encrypted.
