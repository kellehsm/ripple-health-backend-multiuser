# Ripple Wellness — Backend PRODUCTION (CLAUDE.md)

Fastify/PostgreSQL backend for Ripple Wellness (multiuser). Self-hosted on a VPS.

**THIS IS PRODUCTION. Do not develop here — use `/root/wellness-app-multiuser-dev/backend` (dev branch) for all new work.**

## Environment

| | Production (this directory) | Dev |
|---|---|---|
| Directory | `/root/wellness-app-multiuser/backend` | `/root/wellness-app-multiuser-dev/backend` |
| Git branch | `master` | `dev` |
| Port | **4001** | 4002 |
| Database | **`wellness_multiuser`** | `wellness_multiuser_dev` |
| Screen session | **`wellness-prod`** | `wellness-dev` |
| Log file | `/tmp/prod-backend.log` | `/tmp/dev-backend.log` |

- VPS IP: `129.121.125.214`, domain: `app.kels.gg`
- Caddy reverse proxy: `app.kels.gg` → `localhost:4001` (production only)

## Starting / restarting production backend

```bash
# Check first
screen -ls
curl http://localhost:4001/health

# If wellness-prod is missing:
screen -dmS wellness-prod bash -c 'cd /root/wellness-app-multiuser/backend && npm run dev 2>&1 | tee /tmp/prod-backend.log'
```

**NEVER run `npm run dev` outside the `wellness-prod` screen session.**

## Receiving promoted changes from dev

After dev changes are confirmed working and merged into master:

```bash
# In this directory:
git pull origin master
# Restart the backend:
screen -S wellness-prod -X quit
screen -dmS wellness-prod bash -c 'cd /root/wellness-app-multiuser/backend && npm run dev 2>&1 | tee /tmp/prod-backend.log'
curl http://localhost:4001/health
```

## Credentials architecture

- Dexcom Share credentials (`DEXCOM_SHARE_ACCOUNT_ID`, `DEXCOM_SHARE_PASSWORD`) are meant to be editable via the app's Settings screen (stored in `user_settings` / DB), NOT hardcoded to `.env` only.
- USDA FDC API key: `USDA_FDC_API_KEY`
- Never log or expose credential values in API responses — mask with booleans like `"connected": true` instead.

## Dexcom integration — hard-won lessons (don't relearn these)

- Login MUST use `LoginPublisherAccountById` (account-ID-based), NOT username/email/phone-based login.
- The `WT` timestamp field from Dexcom's API is `Date(1691455258000)` with **NO leading slash** — a regex expecting a leading slash will silently fail and default every reading to `new Date()`, causing all data to cluster at one timestamp ("picket fence" bug).
- Skip unparseable timestamps — never fabricate a fallback date for a reading.
- Duplicate readings are prevented via `UNIQUE (user_id, recorded_at)` + `ON CONFLICT DO NOTHING`.

## Correlation language principle (applies to ALL features, non-negotiable)

Every feature that surfaces a pattern across data must stay **descriptive, never diagnostic or causal**:
- Single-day observation → tentative, gentle framing ("glucose climbed after lunch today")
- Multi-day repeated pattern → stronger language IS earned, but must cite the actual count ("4 of the last 5 days")
- NEVER assert causation from one data point. NEVER give medical advice, diagnosis, or prescriptive suggestions.

## Common bug pattern to check first

**Before assuming a sync/log/save function is broken, check the database directly first** (`SELECT ... ORDER BY ... DESC LIMIT 10`). Multiple bugs this project had the shape "backend works, no UI displaying the result."

## Week-start boundary logic

Users can configure a per-section week-start day (`user_settings.settings.week_start.{steps,water,sleep,hobbies}`). Every weekly calculation MUST read this setting — don't hardcode Monday/Sunday via `date_trunc('week', now())`.

## Build/deploy policy

- **Do NOT run `eas build` without explicit user approval.**
- Batch all native-touching changes together before requesting a build.

## Git

- Commit checkpoints after each confirmed-working feature: `git add -A && git commit -m "..."`.
- Only ADD to shared files (`client.ts`-equivalent, route files) — never regenerate wholesale.
