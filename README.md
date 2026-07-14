<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2&height=180&section=header&text=Ripple%20Health%20API&fontColor=FFFFFF&fontSize=48&fontAlignY=38&desc=Fastify%20%C2%B7%20PostgreSQL%20%C2%B7%20TypeScript&descSize=16&descAlignY=60" width="100%" />

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)](.)
[![Fastify](https://img.shields.io/badge/Fastify-000000?style=flat-square&logo=fastify&logoColor=white)](.)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](.)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](.)
[![Self-hosted](https://img.shields.io/badge/Self--hosted-FF6B35?style=flat-square&logo=homeassistant&logoColor=white)](.)

</div>

## What it is

The REST API backend for [Ripple Health](https://github.com/kellehsm/ripple-health). Handles all data storage, external integrations, and aggregation queries for a personal health tracking Android app. Runs on a self-hosted VPS behind a Caddy reverse proxy with automatic HTTPS.

---

## API Surface

| Route prefix | What it does |
|---|---|
| `/glucose` | Store and retrieve CGM readings; real-time status with trend arrows |
| `/glucose/status` | Latest reading with staleness detection and alert flags |
| `/meals` | CRUD meal logs; `/frequent` for top repeated meals; `/glucose-response` per meal |
| `/food/search` | Federated USDA FoodData Central + Open Food Facts search |
| `/food/barcode/:code` | Barcode → food data lookup |
| `/journal` | Mood check-ins (period-based and off-schedule moments) |
| `/summary/today` | Aggregated daily view for the Overview screen |
| `/summary/day` | Full-day event feed with glucose overlay data |
| `/summary/pattern` | Chronological event timeline (meals, mood, spending, glucose spikes) |
| `/health-connect/steps` | Daily step totals by local date |
| `/health-connect/sleep` | Sleep session storage and stats |
| `/health-connect/heart-rate` | Heart rate time-range queries |
| `/metrics` | Generic metric CRUD (water, custom) with weekly stats |
| `/books` | Book library with reading progress logs |
| `/hobbies` | Custom hobby tracking with time/unit logging and week-over-week stats |
| `/spending` | Expense entry and weekly aggregations |
| `/search/glucose` | Historical glucose search (avg threshold, time-of-day filter) |
| `/search/meals` | Meal search by name or min carbs |
| `/search/mood` | Mood history search by score range |
| `/journal/weekly-summary` | Multi-day mood + sleep + spending rows for trend analysis |
| `/settings` | User preferences (week start, HC toggles, Dexcom creds, smart notif config) |
| `/report` | PDF health report generation |
| `/export` | Full JSON data backup |

---

## Key Design Decisions

**Steps are cumulative daily totals.** Health Connect reports steps as cumulative values within a day — the schema stores them that way and always uses `MAX(value)` per day to avoid double-counting. `GET /health-connect/steps/weekly-total` requires `agg=max` (the default).

**Week-start is configurable per section.** Steps, sleep, water, and hobbies each read `user_settings.settings.week_start.[section]` (0 = Sunday … 6 = Saturday) for all "this week" calculations. There is no hardcoded Monday boundary anywhere.

**Dexcom login uses `LoginPublisherAccountById`.** The Dexcom Share API has a username-based and an account-ID-based login path. Only the ID-based path works reliably — do not change this.

**`WT` timestamps have no leading slash.** Dexcom returns timestamps as `Date(1691455258000)` — parsing expects no leading `/`. A regex that expects a slash will silently fall back to `new Date()`, making all readings cluster at one timestamp.

---

## Tech Stack

| | |
|---|---|
| **Runtime** | Node.js 22 |
| **Framework** | Fastify |
| **Language** | TypeScript (ESM, `tsx` for dev, compiled for prod) |
| **Database** | PostgreSQL with `pg` driver |
| **External APIs** | Dexcom Share, USDA FoodData Central, Open Food Facts |
| **PDF generation** | PDFKit |
| **Infrastructure** | Linux VPS, Caddy reverse proxy, Let's Encrypt |

---

## Database Schema (summary)

```sql
users               -- single user app; row holds DEFAULT_USER_ID
glucose_readings    -- (user_id, recorded_at UNIQUE, mg_dl)
meals               -- (user_id, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id)
journal_entries     -- (user_id, mood_score, mood_label, entry_text, period, entry_type)
health_metrics      -- generic metric definitions (water, steps, custom)
metric_logs         -- (metric_id, value, logged_at) — cumulative for steps, count for water
sleep_sessions      -- (user_id, start_time, end_time)
heart_rate_readings -- (user_id, bpm, recorded_at)
books               -- (user_id, title, author, cover_url, total_pages, status)
book_reading_logs   -- (book_id, pages_read, logged_at)
hobbies             -- (user_id, name, unit_label, icon, color_key)
hobby_logs          -- (hobby_id, amount, rating, note, logged_at)
spending            -- (user_id, amount, category, note, logged_at)
user_settings       -- (user_id, settings JSONB) — all preferences and credentials
```

---

## Mobile App

→ [ripple-health](https://github.com/kellehsm/ripple-health) — the React Native / Expo frontend

---

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=2&height=80&section=footer" width="100%" />
</div>
