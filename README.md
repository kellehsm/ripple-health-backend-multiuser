# Wellness App - Project Scaffold

Two pieces:
- `backend/` - Fastify + PostgreSQL API, deployed on your AlmaLinux VPS
- `app/` - Expo (React Native) app, builds to Android + web (wrap the web build with Tauri for a real desktop app)

## Backend setup

```bash
cd backend
npm install
cp .env.example .env      # fill in DATABASE_URL, Dexcom keys, USDA key, etc.

# Create the database and load the schema
createdb wellness
npm run migrate           # runs schema.sql against DATABASE_URL

npm run dev                # http://localhost:4000, auto-reloads on save
```

Routes are organized one file per domain in `src/routes/`:
`metrics.ts` (generic engine: water, screen time, meds, workouts),
`books.ts`, `hobbies.ts`, `meals.ts`, `glucose.ts`, `spending.ts`,
`journal.ts`, `summary.ts` (today's rollup + the pattern timeline).

Not yet wired up (next steps once the basics run):
- Health Connect sync job (pulls steps/sleep/heart rate from the Android app)
- Dexcom OAuth + polling job (writes into `glucose_readings`)
- USDA FoodData Central / Open Food Facts lookup for meal carbs/sugar
- Nightly job to populate `daily_summary` from the raw tables
- Doctor PDF export endpoint

## App setup

```bash
cd app
npm install
npx expo start
```

Press `a` for Android (emulator or a phone with Expo Go), or `w` for a
web build you can later wrap in Tauri for desktop.

Structure:
- `src/theme/` - the approved color tokens (light + dark), one ramp per metric type
- `src/components/MetricCard.tsx` - the reusable stat card used everywhere
- `src/screens/` - Overview, Health, Finance, Life (Reading & Habits) - matches the 4-tab mockup
- `src/navigation/RootTabs.tsx` - bottom tab bar + the dark-mode toggle in the header
- `src/api/client.ts` - talks to the backend; update `BASE_URL` once deployed

Each screen has `// TODO` markers where the mockup's charts/timelines need
real chart components (recommend `react-native-svg` or `victory-native`)
wired to live data instead of the placeholder text.

## Build order recommendation

1. Get backend + app talking (`api.today()` rendering real data on Overview)
2. Books + hobbies logging (the "quick win" - no external APIs needed)
3. Manual meal + spending entry, generic metrics (water etc.)
4. Health Connect integration (steps/sleep/heart rate)
5. Dexcom integration (glucose) + the meal-glucose correlation charts
6. Doctor PDF export
7. Goldfinch integration, if wanted, once the above is stable
