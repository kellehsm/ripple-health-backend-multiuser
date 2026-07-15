# Ripple Wellness — Backend (CLAUDE.md)

Fastify/PostgreSQL backend for Ripple Wellness, a personal single-user wellness tracking app. Self-hosted on a Bluehost VPS.

## Critical operational rules

- **ALWAYS run `screen -ls` before starting the backend.** Keep exactly ONE `wellness` screen session running at any time. Duplicate sessions cause two backends fighting over port 4000 and duplicate Dexcom/data syncs — this has caused real bugs before.
- **NEVER run `npm run dev` outside the `wellness` screen session.**
- **This is a single-user app.** `DEFAULT_USER_ID` in `.env` is the only user. Don't build multi-user auth unless explicitly asked.

## Environment / infrastructure

- VPS IP: `129.121.125.214`, domain: `app.kels.gg` (HTTPS via Caddy reverse proxy, auto Let's Encrypt)
- Backend runs on port 4000
- Database: PostgreSQL, credentials in `.env` as `DATABASE_URL`
- USER_ID: `f2cde901-feae-443e-abed-ddf7302bb131`

## Credentials architecture

- Dexcom Share credentials (`DEXCOM_SHARE_ACCOUNT_ID`, `DEXCOM_SHARE_PASSWORD`) are meant to be editable via the app's Settings screen (stored in `user_settings` / DB), NOT hardcoded to `.env` only — if you find them only in `.env`, that's a gap to fix, not the intended final state.
- SimpleFIN access URL: `SIMPLEFIN_ACCESS_URL` in `.env` — this is a ONE-TIME claimed value (from a setup token), never re-claim it.
- USDA FDC API key: `USDA_FDC_API_KEY`
- Never log or expose credential values in API responses — mask with booleans like `"connected": true` instead.

## Dexcom integration — hard-won lessons (don't relearn these)

- Login MUST use `LoginPublisherAccountById` (account-ID-based), NOT username/email/phone-based login — this caused hours of debugging previously.
- The `WT` timestamp field from Dexcom's API is `Date(1691455258000)` with **NO leading slash** — a regex expecting a leading slash will silently fail and default every reading to `new Date()`, causing all data to cluster at one timestamp ("picket fence" bug). If timestamps look wrong, check this first.
- Skip unparseable timestamps — never fabricate a fallback date for a reading.
- Duplicate readings are prevented via `UNIQUE (user_id, recorded_at)` + `ON CONFLICT DO NOTHING`.

## Correlation language principle (applies to ALL features, non-negotiable)

Every feature that surfaces a pattern across data (glucose/mood/food/spending/sleep) must stay **descriptive, never diagnostic or causal**:
- Single-day observation → tentative, gentle framing ("glucose climbed after lunch today")
- Multi-day repeated pattern → stronger language IS earned, but must cite the actual count ("4 of the last 5 days")
- NEVER assert causation from one data point. NEVER give medical advice, diagnosis, or prescriptive suggestions.
- This applies to AI-generated text (if/when the AI recap feature is built) even more strictly than templated text, since an LLM can generate confident-sounding claims that are actually just noise.

## Common bug pattern to check first

Several bugs this session turned out to be "the backend is actually working, there's just no UI displaying the result" (book page progress, hobby logging, water tracking all had this exact shape). **Before assuming a sync/log/save function is broken, check the database directly first** (`SELECT ... ORDER BY ... DESC LIMIT 10`) to see if data is actually being written. Don't rebuild working backend logic because of a frontend display gap.

## Week-start boundary logic

Users can configure a per-section week-start day (`user_settings.settings.week_start.{steps,water,sleep,hobbies}`). Every weekly calculation (weekly totals, week-over-week comparisons) MUST read this setting and use it — don't hardcode Monday/Sunday via `date_trunc('week', now())`. Consolidate this into ONE shared helper function that all weekly-boundary queries call, rather than reimplementing per-feature (this exact bug — setting saved but never read — has happened before).

## Build/deploy policy

- **Do NOT run `eas build` without explicit user approval.** EAS build credits are limited.
- Batch all native-touching changes (native modules, permissions, icons, Health Connect, foreground services) together before requesting a build — don't burn a build per change.
- JS/backend-only changes need no approval to implement/test — only the actual `eas build` command requires asking first.

## Git

- Repo is under git. Commit checkpoints after each confirmed-working feature: `git add -A && git commit -m "..."`.
- Before starting a new spec that touches shared files (`client.ts`-equivalent, route files), only ADD to them — don't regenerate wholesale, to avoid clobbering unrelated previous work.
