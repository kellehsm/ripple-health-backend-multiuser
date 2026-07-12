# Ripple Health — Backend

The API server for [Ripple Health](https://github.com/kellehsm/wellness-fresh), a personal health app built around one idea: stress, eating, sleep, and spending aren't separate problems — they're the same pattern showing up in different places.

This backend collects data from multiple sources (Dexcom CGM, Android Health Connect, manual logging) and exposes it through a unified API so the mobile app can surface those connections in one place.

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
