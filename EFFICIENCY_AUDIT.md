# Efficiency Audit — Recommended Fixes

Audit date: 2026-07-29. All fixes should be implemented in the dev environment, not production.
Work order: stop-ship items first, then high-impact, then medium, then low.

---

## STOP-SHIP (fix before next EAS build)

### 1. UndoBanner runtime crash
**File:** `app/src/components/UndoBanner.tsx`  
**Problem:** `backgroundColor: cardBg` — `cardBg` is never imported or declared. ReferenceError thrown every time the undo banner renders. Any delete action in the app crashes immediately.  
**Fix:** Import `useCardBg` from `AppSettingsContext` and call it at the top of the component:
```tsx
import { useCardBg } from "../theme/AppSettingsContext";
const cardBg = useCardBg();
```

---

### 2. Missing dependencies in package.json
**File:** `app/package.json`  
**Problem:** 7 packages are imported in `src/` but absent from `dependencies`. A clean install (CI, EAS build from scratch) omits them and the build fails with a native-module error.  
**Fix:** Add the following to `dependencies` (use the versions already installed in `node_modules`):
- `react-native-reanimated`
- `expo-secure-store`
- `expo-sqlite`
- `expo-camera`
- `expo-linear-gradient`
- `react-native-health-connect`
- `@notifee/react-native`

Run `npm install` from `app/` to verify, then re-run `npm ls <package>` to confirm resolved versions.

---

## HIGH — Correctness

### 3. Caffeine/sodium columns missing from schema
**Files:** `backend/schema.sql`, `backend/src/jobs/dailySummaryService.ts`, insight rules  
**Problem:** `dailySummaryService.getNutritionData()` selects `caffeine_mg` and `sodium_mg` from `meals`, but these columns appear in no migration file and are not in `schema.sql`. If they don't exist in the DB, `CaffeineVsSleepRule` and `CaffeineVsGlucoseRule` silently return null for every user — no caffeine insights ever fire.  
**Fix:**
1. Verify in psql: `\d meals` — if the columns are missing, create a migration:
```sql
-- migrations/023_meals_caffeine_sodium.sql
ALTER TABLE meals
  ADD COLUMN IF NOT EXISTS caffeine_mg NUMERIC,
  ADD COLUMN IF NOT EXISTS sodium_mg   NUMERIC;
```
2. If the columns already exist (added manually), add this migration to document and replay them cleanly.

---

### 4. Stale insights persist after partial insight-job run
**File:** `backend/src/jobs/insightsEngine.ts`  
**Problem:** Each rule calls `upsertInsight` individually, then `markStale` is called at the end in a separate statement. If the process crashes (OOM, SIGTERM) after 30 of 57 rules have been upserted but before `markStale` runs, old insights from the other 27 rules remain `active` indefinitely.  
**Fix:** Wrap the full upsert + markStale sequence in a transaction, or run `markStale` as the first step (marking everything stale), then upsert results. The upsert-first / markStale-last order is the fragile direction; reversing it means a partial run leaves insights stale rather than leaving obsolete insights active:
```ts
// Option: mark stale first, then upsert
await markStale(userId, []); // mark all active insights stale
await Promise.allSettled(rules.map(r => runRule(r, userId)));
// Now only rules that ran successfully have re-activated their insights
```

---

## HIGH — Performance

### 5. Date-cast queries not using indexes (30-min job)
**Files:** `backend/src/jobs/dailySummaryService.ts` — every data-getter function  
**Problem:** Queries using `logged_at::date = $2`, `end_time::date = $2`, etc. cannot use the existing B-tree indexes as range scans. The planner must evaluate the cast per-row after the `user_id` prefix scan. This runs every 30 minutes for every user.  
**Affected queries:** `getNutritionData` (meals), `getMoodData` (journal_entries), `getActivityData` / `getHydrationData` / `getMindfulnessData` (metric_logs), `getSleepData` (sleep_sessions.end_time), `getGlucoseData` (glucose_readings).  
**Fix:** Replace cast-equality patterns with range comparisons that the existing indexes can serve:
```sql
-- Instead of:
WHERE user_id = $1 AND logged_at::date = $2

-- Use:
WHERE user_id = $1
  AND logged_at >= $2::date
  AND logged_at <  $2::date + INTERVAL '1 day'
```
Apply this pattern to all 7 affected queries in `dailySummaryService.ts`.

---

### 6. Nightly backup loads entire glucose/HR history into memory
**File:** `backend/src/jobs/google-drive-backup.ts`  
**Problem:** `SELECT * FROM glucose_readings WHERE user_id = $1 ORDER BY recorded_at` with no LIMIT. A CGM user with 2 years of data has ~210,000 rows. Combined with `heart_rate_readings` (up to 14,400 rows/day for continuous monitoring), nightly backups for multiple users running concurrently can OOM a modest VPS.  
**Fix (near-term):** Add a rolling window to the backup — keep the last 2 years and move older data to a separate archive table, or add `ORDER BY recorded_at DESC LIMIT 262800` (2 years × 288/day). This won't lose data because the Drive backup is already a supplement to the DB.  
**Fix (proper):** Stream the query result to the Drive upload rather than buffering the entire result in Node heap with `Buffer.concat`. Use `pg`'s cursor API to page through rows in chunks and write them to a streaming multipart upload.

---

### 7. Animation loop not cleaned up on LoadingScreen unmount
**File:** `app/src/components/LoadingScreen.tsx`  
**Problem:** `Animated.parallel([pulse(ring1,0), ...]).start()` is called in `useEffect` with no cleanup return. The animation contains `Animated.loop` and keeps running on the JS thread after the loading screen unmounts. Each mount/unmount cycle accumulates another orphaned animation loop.  
**Fix:** Capture the animation reference and stop it on cleanup:
```tsx
useEffect(() => {
  const anim = Animated.parallel([pulse(ring1, 0), pulse(ring2, 520), pulse(ring3, 1040)]);
  anim.start();
  return () => anim.stop();
}, []);
```

---

### 8. ExerciseSessionScreen spreads growing HR array every second
**File:** `app/src/screens/ExerciseSessionScreen.tsx` ~line 125  
**Problem:** `Math.max(...sessionHR.map(r => r.bpm))` runs in the render body. The component re-renders every second (interval timer). At the end of a 1-hour session with 3,600 HR samples, this spreads a 3,600-element array every second.  
**Fix:** Track the running max as a ref updated when a new HR sample arrives, rather than recomputing from the full array on every render:
```tsx
const maxHRRef = useRef(0);
// When adding a new HR sample:
maxHRRef.current = Math.max(maxHRRef.current, newSample.bpm);
```

---

### 9. journal.ts weekly-summary fires 450 subqueries per request
**File:** `backend/src/routes/journal.ts` ~line 62 (`GET /weekly-summary`)  
**Problem:** 5 correlated subqueries embedded inside a `generate_series` — one per metric per day. At a 90-day window: 5 × 90 = 450 internal subquery executions per request.  
**Fix:** Replace each correlated subquery with a CTE that pre-aggregates the data, then LEFT JOIN to the date series:
```sql
WITH mood_by_day AS (
  SELECT logged_at::date AS d, AVG(mood_score) AS avg_mood
  FROM journal_entries
  WHERE user_id = $1 AND logged_at >= $start AND logged_at < $end
  GROUP BY 1
),
sleep_by_day AS (
  SELECT end_time::date AS d, SUM(duration_minutes) AS sleep_hours
  FROM sleep_sessions
  WHERE user_id = $1 AND end_time >= $start AND end_time < $end
  GROUP BY 1
)
-- etc., then LEFT JOIN each CTE to generate_series
SELECT gs.day, m.avg_mood, s.sleep_hours, ...
FROM generate_series($start, $end, '1 day') gs(day)
LEFT JOIN mood_by_day   m ON m.d = gs.day
LEFT JOIN sleep_by_day  s ON s.d = gs.day
...
```

---

## MEDIUM — N+1 Queries

### 10. challenges.ts: computeProgress N+1 on list and detail endpoints
**File:** `backend/src/routes/challenges.ts` ~85–99 (list), ~208–221 (detail)  
**Problem:** Separate `computeProgress()` DB query per challenge (list) and per participant (detail). 10 challenges × 10 participants = 100 DB round-trips for a single detail page.  
**Fix:** Refactor `computeProgress` to accept an array of `(userId, challengeId)` pairs and return results in one batched query using `= ANY(...)` grouped by `user_id` and `challenge_id`.

---

### 11. Google Drive restore inserts one row at a time
**File:** `backend/src/routes/google-drive.ts` ~118–190 (`POST /restore`)  
**Problem:** Individual `INSERT ... ON CONFLICT DO NOTHING` per row. A 1-year CGM backup with ~105,000 glucose readings = 105,000+ sequential INSERT statements.  
**Fix:** Batch inserts using `INSERT INTO ... SELECT unnest($1::...[])` or build multi-row `VALUES` clauses in chunks of 500–1,000 rows.

---

### 12. Medication import fires 2–4 queries per row
**File:** `backend/src/routes/medications.ts` ~520–565 (`POST /import/commit`)  
**Problem:** 50-row import = 150–250 sequential DB round-trips.  
**Fix:** Pre-fetch all existing prescribers in one query before the loop; batch the medication inserts and slot inserts using multi-row VALUES or COPY.

---

### 13. Plaid initial sync inserts one transaction at a time
**File:** `backend/src/routes/plaid.ts` ~276–314  
**Problem:** One INSERT per transaction. Initial bank sync can return thousands of transactions (Plaid returns up to 2 years on first connect).  
**Fix:** Batch the inserts using multi-row VALUES (chunk to 500 rows at a time to stay within parameter limits).

---

### 14. CompletedScreen / LifeScreen: N+1 bookProgress requests
**Files:** `app/src/screens/CompletedScreen.tsx` ~312–322, `app/src/screens/LifeScreen.tsx`  
**Problem:** One `api.bookProgress(id)` request per book via `Promise.all`. 50 completed books = 50 simultaneous requests.  
**Fix:** Add a `GET /books/progress/batch?ids=id1,id2,...` endpoint (or include progress in the book list response) and update both screens to use a single request.

---

## MEDIUM — Missing Database Indexes

All should use `CREATE INDEX IF NOT EXISTS` — safe, non-destructive, re-runnable. Add to a new migration `023_missing_indexes.sql` (or `024_` if caffeine migration is 023).

```sql
-- chart_annotations: range queries by user + date
CREATE INDEX IF NOT EXISTS idx_annotations_user_time
  ON chart_annotations (user_id, annotated_at);

-- spending_entries: filter untagged entries
CREATE INDEX IF NOT EXISTS idx_spending_untagged
  ON spending_entries (user_id, logged_at)
  WHERE tag IS NULL;

-- friend_connections: all friend-tab queries
CREATE INDEX IF NOT EXISTS idx_friend_connections_a ON friend_connections (user_id_a, status);
CREATE INDEX IF NOT EXISTS idx_friend_connections_b ON friend_connections (user_id_b, status);

-- friend_nudges: 24-hour rate-limit check
CREATE INDEX IF NOT EXISTS idx_friend_nudges_pair_time
  ON friend_nudges (sender_id, recipient_id, sent_at);

-- hobby_logs: multi-user activity feed / leaderboard
CREATE INDEX IF NOT EXISTS idx_hobby_logs_user
  ON hobby_logs (user_id, logged_at DESC);

-- reading_logs: multi-user activity feed
CREATE INDEX IF NOT EXISTS idx_reading_logs_user
  ON reading_logs (user_id, logged_at DESC);

-- cycle_day_logs: cycle history and prediction queries
CREATE INDEX IF NOT EXISTS idx_cycle_logs_user_date
  ON cycle_day_logs (user_id, log_date DESC);

-- substance_logs: insight rules and substance history
CREATE INDEX IF NOT EXISTS idx_substance_logs_user_time
  ON substance_logs (user_id, logged_at DESC);

-- journal_entries: entry_type filter combined with existing time index
CREATE INDEX IF NOT EXISTS idx_journal_type
  ON journal_entries (user_id, entry_type, logged_at DESC);
```

---

## MEDIUM — Unbounded API Results

Add defensive LIMIT clauses to prevent unbounded responses. None of these change behavior for normal usage — they only cap pathological or malicious requests.

| File | Endpoint | Recommended limit |
|---|---|---|
| `routes/glucose.ts` | `GET /` with date range | `LIMIT 5000` (17 days of CGM) |
| `routes/heart-rate.ts` | `GET /` with date range | `LIMIT 10000` |
| `routes/spending.ts` | `GET /` with `since` | `LIMIT 2000` |
| `routes/cycle.ts` | `GET /prediction` | `LIMIT 180` (15 years of cycles — more than enough) |
| `routes/cycle.ts` | `GET /history`, `GET /overview-insight` | `LIMIT 36` (3 years) |
| `routes/medications.ts` | `GET /:id/history` | `LIMIT 200` |

---

## MEDIUM — Redundant Queries (Backend)

### 15. Read-then-write pattern in settings, tab-preferences, google-auth
**Files:** `routes/settings.ts`, `routes/tab-preferences.ts`, `routes/google-auth.ts`  
**Fix:** Replace SELECT + UPDATE with a single PostgreSQL JSONB merge:
```sql
INSERT INTO user_settings (user_id, settings)
VALUES ($1, $2::jsonb)
ON CONFLICT (user_id)
DO UPDATE SET settings = user_settings.settings || EXCLUDED.settings;
```

---

### 16. Write-on-read in social-notifications and friends sharing-prefs
**Files:** `routes/social-notifications.ts` ~10–15, `routes/friends.ts` ~183–195  
**Problem:** `INSERT ON CONFLICT DO NOTHING` fires on every GET request to initialize rows that should exist at account creation.  
**Fix:** Move the initialization INSERT into the account creation flow (`routes/auth.ts` POST /register). Remove the guard from the GET handlers.

---

### 17. metrics.ts daily-breakdown: 14 subqueries per request
**File:** `backend/src/routes/metrics.ts` ~109–148  
**Fix:** Same CTE approach as the journal weekly-summary (finding #9) — pre-aggregate by date in a CTE, LEFT JOIN to the generate_series.

---

### 18. dailySummaryJob: skip users with no data today
**File:** `backend/src/jobs/dailySummaryJob.ts`  
**Fix:** Before running the 11-query summary for a user, check if any data was logged today:
```sql
SELECT EXISTS (
  SELECT 1 FROM journal_entries
  WHERE user_id = $1 AND logged_at::date = $2
  UNION ALL
  SELECT 1 FROM glucose_readings
  WHERE user_id = $1 AND recorded_at::date = $2
  LIMIT 1
) AS has_data
```
Skip the full summary computation if `has_data` is false. This reduces the per-30-minute job from 11×N queries to 1×N queries for inactive users.

---

### 19. dexcom-share-sync: eliminate redundant user_settings fetch
**Files:** `backend/src/jobs/server.ts` (cron), `backend/src/jobs/dexcom-share-sync.ts`  
**Fix:** Pass the already-fetched credentials from the cron pre-filter into `syncDexcomShareGlucose` as a parameter instead of having `resolveCredentials` re-fetch them. Halves DB load for this cron.

---

## LOW — Frontend Render Stability

### 20. ObsidianBg and CleanSlateBg: random positions without useMemo
**File:** `app/src/theme/backgrounds/index.tsx`  
**Fix:**
```tsx
// ObsidianBg
const stars = useMemo(() =>
  Array.from({ length: 90 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5 })),
[w, h]);

// CleanSlateBg — same pattern for dots
const dots = useMemo(() => /* build dot array */, [w, h]);
```

---

### 21. WeekComparisonChart: stale screen width after rotation
**File:** `app/src/components/WeekComparisonChart.tsx` ~21–22  
**Fix:** Replace the module-level constant with `useWindowDimensions`:
```tsx
import { useWindowDimensions } from "react-native";
// inside component:
const { width: SCREEN_W } = useWindowDimensions();
```

---

### 22. HeartRateDetailScreen: unmemoized min/max/reduce on large arrays
**File:** `app/src/screens/HeartRateDetailScreen.tsx` ~77–109  
**Fix:**
```tsx
const { min, max, avg } = useMemo(() => ({
  min: Math.min(...bpms),
  max: Math.max(...bpms),
  avg: bpms.reduce((s, v) => s + v, 0) / bpms.length,
}), [bpms]);
```

---

### 23. TrendsScreen CorrCard: statistical computation without useMemo
**File:** `app/src/screens/TrendsScreen.tsx`  
**Fix:**
```tsx
const { r, slope, aboveAvg } = useMemo(
  () => ({ r: pearson(xVals, yVals), slope: linReg(xVals, yVals), aboveAvg: splitAvg(xVals, yVals) }),
  [xVals, yVals]
);
```

---

### 24. InsightsScreen / ChallengesScreen / FriendsScreen: unmemoized filters
**Files:** `InsightsScreen.tsx`, `ChallengesScreen.tsx`, `FriendsScreen.tsx`  
**Fix:** Wrap all inline `filter()` calls and `new Date()` computations in `useMemo` with appropriate dependencies.

---

### 25. CompletedScreen: FlatList for book shelves
**File:** `app/src/screens/CompletedScreen.tsx` ~367–389  
**Fix:** Replace `<ScrollView>{completedBooks.map(...)}</ScrollView>` with a `<FlatList>` so only visible books are mounted. For the book-cover grid, use a `numColumns` FlatList.

---

### 26. useCardBg: memoize hex computations
**File:** `app/src/theme/AppSettingsContext.tsx`  
**Fix:**
```tsx
export function useCardBg(): string {
  const { cardOpacity, cardGlass } = useAppSettings();
  const { theme } = useTheme();
  return useMemo(() => {
    const base = cardGlass ? blendWithWhite(theme.card, 0.28) : theme.card;
    const alpha = cardGlass ? cardOpacity * 0.82 : cardOpacity;
    return hexWithAlpha(base, alpha);
  }, [theme.card, cardGlass, cardOpacity]);
}
```

---

### 27. pageTemplates.tsx: replace linear scan with lookup Map
**File:** `app/src/theme/pageTemplates.tsx`  
**Fix:** Build an inverted Map at module load time mapping `(templateId, cardId)` → background token. Replace the `for...of` / `.find()` inside `useCardBackground`, `useTileBackground`, and `ThemedSurface` with a single O(1) Map lookup.

---

### 28. FeatureTour: cancel timeouts on unmount
**File:** `app/src/components/FeatureTour.tsx` ~169, 172, 175  
**Fix:** Store timeout IDs in refs and cancel them in `useEffect` cleanup:
```tsx
const timeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);
// when setting:
timeoutRef.current.push(setTimeout(...));
// cleanup:
useEffect(() => () => timeoutRef.current.forEach(clearTimeout), []);
```

---

## LOW — Schema / Database Cleanup

### 29. Drop or document dead daily_summary table
**File:** `backend/schema.sql`  
**Action:** Confirm in psql whether `daily_summary` (singular) exists alongside `daily_summaries` (plural). If yes, create a migration to drop it:
```sql
DROP TABLE IF EXISTS daily_summary;
```
If it doesn't exist in production, remove it from `schema.sql` to prevent confusion.

---

### 30. Add TTL cleanup for sync_log
**File:** `backend/migrations/003_jsonb_context_and_sync_log.sql`  
**Fix:** Add a nightly cleanup job (or pg_cron entry) to prune old sync_log entries:
```sql
DELETE FROM sync_log WHERE processed_at < NOW() - INTERVAL '30 days';
```

---

### 31. Merge duplicate error boundaries
**Files:** `app/src/components/ErrorBoundary.tsx`, `app/src/components/AppErrorBoundary.tsx`  
**Fix:** Pick one, update all import sites to use it, delete the other.

---

## CATEGORY 2 — Insight engine: add pre-flight data checks

### 32. Skip rules when user has no relevant data
**File:** `backend/src/jobs/insightsEngine.ts`  
**Fix:** Before running the 57 rules, fetch a single summary row of what data the user actually has:
```sql
SELECT
  EXISTS(SELECT 1 FROM substance_logs WHERE user_id=$1) AS has_substances,
  EXISTS(SELECT 1 FROM cycle_day_logs  WHERE user_id=$1) AS has_cycle,
  EXISTS(SELECT 1 FROM heart_rate_readings WHERE user_id=$1) AS has_hr,
  EXISTS(SELECT 1 FROM glucose_readings WHERE user_id=$1) AS has_glucose
```
Then skip rules whose required data type is absent. Eliminates 10–15 wasted DB queries per user per nightly run.

---

*End of recommended fixes. Total: 32 action items across all 9 audit categories.*
