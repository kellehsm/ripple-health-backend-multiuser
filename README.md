# Ripple Health — Backend

The API server for **[Ripple Health](https://github.com/kellehsm/ripple-health)** — a personal wellness app built around understanding how food, stress, sleep, mood, movement, hobbies, and spending all interact with blood sugar and overall wellbeing.

This backend is the data layer that makes cross-domain analysis possible. It ingests from multiple sources (Dexcom CGM, Android Health Connect, manual logging), stores everything in a unified PostgreSQL database, and exposes the endpoints the mobile app uses to surface connections that siloed trackers can't see.

---

## What This Server Does

- **Polls Dexcom every 5 minutes** for continuous glucose readings and writes them to the database
- **Receives Health Connect syncs** (steps, sleep, heart rate) pushed from the Android app
- **Serves the cross-domain pattern and summary endpoints** — the core of what makes Ripple Health different from a single-purpose tracker
- **Generates PDF doctor reports** with glucose stats, trend charts, and meal-glucose correlation tables
- **Runs parameterized search** across glucose, meals, mood, and spending so the app can answer questions like "what were my highest glucose days?" or "which meals spiked me above 180?"

---

## Architecture

```
backend/
  src/
    routes/         One file per domain (see table below)
    jobs/           Background jobs (Dexcom polling, sync)
    server.ts       Fastify entry point, route registration
    db.ts           PostgreSQL connection pool
```

**Runtime:** Node.js + Fastify + PostgreSQL, running on a VPS behind Caddy (auto TLS at `app.kels.gg`).

---

## API Routes

| Domain | File | Description |
|---|---|---|
| Summary | `summary.ts` | Daily rollup, pattern timeline, weekly digest, streaks |
| Glucose | `glucose.ts` + `glucose-status.ts` | CGM readings, current trend arrow, time-in-range |
| Meals | `meals.ts` + `food.ts` | Meal logging, USDA food search, barcode lookup, post-meal glucose response |
| Health Connect | `health-connect.ts` | Steps (by local date), sleep sessions, heart rate readings |
| Metrics | `metrics.ts` | Generic metric engine — water, steps weekly total, daily breakdown by week-start day |
| Journal | `journal.ts` | Mood scores (1–5), time-of-day periods, free-text entries, weekly summary |
| Books | `books.ts` + `books-search.ts` | Reading list, page logs, progress tracking |
| Hobbies | `hobbies.ts` | Hobby time logs, ratings, weekly stats |
| Spending | `spending.ts` | Expense logging with category breakdowns |
| Search | `search.ts` | Parameterized cross-domain search (glucose, meals, mood, spending) |
| Export | `export.ts` | PDF doctor report (pdfkit), full JSON data backup |
| Settings | `settings.ts` | Per-user JSONB settings with one-level-deep merge on PATCH |
| Dexcom auth | `dexcom-auth.ts` | OAuth flow + Share credential sync |

---

## Background Jobs

- **`dexcom-sync.ts`** — Polls the Dexcom API every 5 minutes, writes glucose readings with trend arrows into `glucose_readings`
- **`dexcom-share-sync.ts`** — Alternative sync path using Dexcom Share credentials (email + password)

---

## Key Technical Details

**Steps aggregation** — Steps are stored as cumulative daily totals (each Health Connect sync inserts the running total for that day). All step queries use `MAX(value) per day` then `SUM`, never a raw `SUM` across all logs.

**Week-start day** — Weekly totals and daily breakdowns respect a per-user configurable week-start day (0=Sun through 6=Sat). Stored in `user_settings.settings.week_start.steps`.

**Meal-glucose correlation** — For each meal, the `/meals/:id/glucose-response` endpoint finds CGM readings in the 60–90 minute post-meal window and returns the average. This is how the app surfaces actual glycemic response vs. theoretical carb impact.

**Pattern endpoint** — Joins glucose, steps, sleep, mood, meals, and spending across a date window into a unified timeline. This is what the Home screen uses to build the daily glance summary.

**Search** — All four search endpoints (`/search/glucose`, `/search/meals`, `/search/mood`, `/search/spending`) use fully parameterized SQL — no string concatenation of user input.

**PDF export** — Uses `pdfkit` to generate a doctor-ready report with a rendered glucose chart (polyline), time-in-range stats, and a meal-glucose table. Streamed directly to the response.

---

## Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in: DATABASE_URL, DEXCOM_CLIENT_ID, DEXCOM_CLIENT_SECRET, USDA_API_KEY

createdb wellness
npm run migrate   # applies schema.sql

npm run dev       # starts on http://localhost:4000, auto-reloads on change
```

Health check:
```bash
curl http://localhost:4000/health
# → {"ok":true}
```

---

## Production

Runs in a persistent `screen` session on the VPS:

```bash
screen -ls   # check if session exists before creating a new one
screen -r wellness

# If session doesn't exist:
screen -dmS wellness bash -c 'cd /root/wellness-app/backend && npm run dev 2>&1 | tee /tmp/wellness-backend.log'
```

Proxied through Caddy at `https://app.kels.gg/api` with automatic TLS.

---

## Mobile App

The Android app that consumes this API: **[kellehsm/ripple-health](https://github.com/kellehsm/ripple-health)**

---

## Architecture

```
backend/
  src/
    routes/       # One file per domain (see below)
    jobs/         # Background sync jobs (Dexcom polling)
    server.ts     # Fastify entry point
    db.ts         # PostgreSQL connection pool
```

**Runtime:** Node.js + Fastify + PostgreSQL, running on a VPS behind Caddy (automatic TLS at `app.kels.gg`).

---

## API routes

| Domain | File | What it does |
|---|---|---|
| Summary | `summary.ts` | Daily rollup + pattern timeline across all domains |
| Glucose | `glucose.ts` + `glucose-status.ts` | CGM readings, trend, time-in-range |
| Meals | `meals.ts` + `food.ts` | Meal logging, food search, barcode lookup, post-meal glucose response |
| Health Connect | `health-connect.ts` | Receives steps, sleep, and heart rate synced from the Android app |
| Books | `books.ts` + `books-search.ts` | Reading list, page logs, progress tracking |
| Hobbies | `hobbies.ts` | Hobby time logs and stats |
| Spending | `spending.ts` | Expense logging with category breakdowns |
| Journal | `journal.ts` | Mood scores and free-text entries |
| Metrics | `metrics.ts` | Generic metric engine (water, screen time, medications, etc.) |
| Dexcom auth | `dexcom-auth.ts` | OAuth flow for Dexcom API access |

---

## Background jobs

- **`dexcom-sync.ts`** — Polls the Dexcom API every 5 minutes and writes glucose readings into the database
- **`dexcom-share-sync.ts`** — Alternative sync path using Dexcom Share credentials

---

## Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in: DATABASE_URL, DEXCOM_CLIENT_ID, DEXCOM_CLIENT_SECRET, USDA_API_KEY

createdb wellness
npm run migrate   # runs schema.sql against DATABASE_URL

npm run dev       # starts on http://localhost:4000, auto-reloads on save
```

Health check: `curl http://localhost:4000/health` → `{"ok":true}`

In production the server runs inside a persistent `screen` session and is proxied through Caddy:

```bash
screen -r wellness
# or to start a new session:
screen -dmS wellness bash -c 'cd backend && npm run dev 2>&1 | tee /tmp/wellness-backend.log'
```

---

## The connection this backend enables

The summary and pattern endpoints are the core of what makes Ripple Health different from a single-purpose tracker. They join glucose, steps, sleep, mood, meals, and spending across a time window so the mobile app can answer questions like:

- Did glucose spike more on days with high-carb meals *and* poor sleep?
- Does spending go up on days with low mood scores?
- Is there a lag between stressful days (mood) and worse eating choices (meals)?

The raw data lives in separate domain tables. The pattern endpoint stitches it together into a timeline the app can visualize.
