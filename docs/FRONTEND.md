# Ripple Wellness — Frontend Architecture

> Living document — update whenever frontend architecture, navigation, API layer, or build config change.

---

## 1. Structure

### App.tsx bootstrap flow

`App.tsx` is the entry point. On mount it:

1. Loads Nunito font variants via `useFonts` (`@expo-google-fonts/nunito`); renders a blank cream screen until fonts resolve.
2. Calls `applyGlobalFontPatch()` at module scope — patches `Text.render` before any component mounts.
3. On `initAuth()`: reads `ripple_jwt` from SecureStore. If absent → `"login"` state. If present, calls `GET /api/me`; 401/403 clears the token; non-network errors trust the cached token and proceed to `"app"` state.
4. State machine: `"loading" | "login" | "signup" | "onboarding" | "app"`. Each state renders a separate provider tree (all wrapped in `AppErrorBoundary > ThemeProvider > AppSettingsProvider > StringsProvider`).
5. In `"app"` state adds `TabPreferencesProvider`, mounts `RootTabs`, `ToastHost`, `OfflineBanner`, `NavRippleOverlay`, `WhatsNewModal`, and the biometric lock overlay.
6. Biometric lock triggers on every `AppState` → `"active"` event if enabled and not currently unlocked.
7. Deep links: validated against `DEEP_LINK_SCHEMES` (`ripple:`, `https:`) and `DEEP_LINK_HOSTS` — unknown hosts/schemes are silently dropped. Actions: `log-water`, `meals`, `mood`, `health`, `wellness`, `glucose`, `sleep`, `steps`, `heartrate`, `insights`.
8. Notification actions (via `@notifee/react-native`, gracefully stubbed if not linked) dispatch to tabs or root-stack screens on foreground events and cold-start.

### src/ layout

| Directory | Purpose |
|---|---|
| `api/` | `baseUrl.ts` (URL resolution), `client.ts` (fetch wrapper, dedup, timeout), `config.ts`, `friends.ts` |
| `components/` | ~55 shared UI components: cards, modals, sheets, banners, forms, loaders |
| `constants/` | `dashboardCards.ts`, `moodCategories.ts`, `index.ts` |
| `context/` | `TabPreferencesContext.tsx` — tab ordering/visibility state |
| `hooks/` | `useHaptic`, `useModals`, `usePressScale`, `useReduceMotion`, `useTabPreferences` |
| `lib/` | Stateful platform helpers: `auth.ts`, `biometricLock.ts`, `fastingTimer.ts`, `foregroundService.ts`, `healthConnect.ts`, `insightAlerts.ts`, `notifeeSafe.ts`, `smartNotifications.ts`, `timezone.ts`, `toast.ts`, etc. |
| `navigation/` | `RootTabs.tsx` (NavigationContainer + stack + tab navigator), `navigationRef.ts` |
| `onboarding/` | `featureIntros.ts`, `useFeatureIntro.ts` — per-feature first-time flows |
| `screens/` | ~45 screens; settings sub-screens live in `screens/settings/` |
| `strings/` | `StringsContext.tsx` + `defaults.ts` — i18n-ready string overrides |
| `theme/` | Design system (see §3) |
| `types/` | `substances.ts`, `tabPreferences.ts` |
| `utils/` | Pure helpers: `dateUtils`, `syncQueue`, `networkState`, `staleCache`, `errorReport`, barcode cache, formatters |

### Navigation architecture

Two-level navigation inside `RootTabs.tsx`:

**Root stack** (`createNativeStackNavigator`): `Tabs` (headerShown: false) + ~35 named screens pushed on top — Settings, History, all detail screens (Steps/HeartRate/Sleep), Insights, Mindfulness, Chat, ExerciseSession, Friends, Challenges, Leaderboard, Medication flows, Experiments, monthly recap, watch tiles, etc.

**Tab navigator** (inside `"Tabs"` screen): `createBottomTabNavigator` with a custom `BottomNav` tab bar. Seven routes, lazily mounted by default:

| Route name | Screen | Accent color |
|---|---|---|
| `Wellness` | `HealthScreen` | teal |
| `Meals` | `MealsScreen` | coral |
| `Health` | `HealthTabScreen` | amber |
| `Exercise` | `ExerciseScreen` | berry |
| `Home` | `OverviewScreen` | page |
| `Life` | `LifeScreen` | violet |
| `Finance` | `FinanceScreen` | violet |

Each tab header carries a shared icon bar: Insight, Friends, Search, Settings (navigates to root stack via `navigation.getParent()?.navigate(...)`). Tab order and visibility are user-customizable via `TabPreferencesContext`.

`navigationRef` is a `createNavigationContainerRef` exported from `src/navigation/navigationRef.ts`; App.tsx uses `navigateWhenReady()` / `navigateRootWhenReady()` helpers that poll at 50 ms intervals up to 5 s to safely dispatch navigation before the container is ready (needed for cold-start deep links / notifications).

---

## 2. API layer

### baseUrl resolution

```ts
// src/api/baseUrl.ts
export const BASE_URL =
  (Constants.expoConfig?.extra as any)?.apiBaseUrl ?? "https://app.kels.gg/api";
```

`app.json` sets `extra.apiBaseUrl = "https://app.kels.gg/api"`. Dev builds point to `http://129.121.125.214:4002` via a separate `app.json` override in the dev repo.

### client.ts

- `request(path, options)` — all API calls go through this. GET requests are de-duplicated: identical in-flight GETs share one `Promise` via `inflightGets` Map.
- 15-second abort timeout (`AbortController`) on every request.
- `Authorization: Bearer <token>` header injected from SecureStore on each call.
- Network errors → `setNetworkOnline(false)` → triggers `OfflineBanner`.
- `ApiError` class carries `.status` for structured error handling (use `err instanceof ApiError && err.status === 401` rather than string matching).

### Auth token storage

- JWT stored in `expo-secure-store` under key `ripple_jwt`.
- On `setToken()`: also writes a separate widget-scoped token to `FileSystem.documentDirectory + "widget_auth.json"` via `POST /api/auth/widget-token` (plain file because the Android widget process cannot access SecureStore).
- On `logout()`: deletes SecureStore key, deletes widget auth file, clears barcode cache, clears water metric cache, fires the registered logout handler (which sets `appState` back to `"login"`).

### Sync / offline model

Failed writes to queueable endpoints (`/meals`, `/journal`, `/spending`, `/metrics/`, `/substances`) are persisted to a local SQLite database (`ripple_sync.db`) via `src/utils/syncQueue.ts`:

- `queueOfflineRequest(endpoint, method, payload)` — inserts a row with a UUID `_sync_id` embedded in the payload.
- `processSyncQueue()` — drains up to 50 items per call via `POST /api/sync/batch`. The backend handles idempotency; `already_processed` and `discard` statuses are treated as success and removed. Items exceeding 10 retry attempts are dropped.
- `src/utils/staleSyncState.ts` and `StaleSyncBanner` expose the pending-item count to the UI.
- `src/utils/networkState.ts` tracks online/offline state; components subscribe via `OfflineBanner`.

---

## 3. Theme system

### Tokens (`src/theme/tokens.ts`)

Shared numeric constants: `FONT_SIZES` (micro 9 → display 28), `SPACING` (xs 4 → xxl 32), `RADIUS` (sm 8 → card 18, pill 100).

### Palettes and ThemeContext

`src/theme/palettes.ts` defines named `Theme` objects (light and dark variants). The active palette is persisted to SecureStore under `ripple_palette_id`. Default is `"morning-mist"` (cream light theme).

`ThemeContext` (from `src/theme/ThemeContext.tsx`) exposes:
- `theme` — the active `Theme` object with color tokens (`page`, `card`, `ink`, `textStrong`, `textSoft`, `teal`, `coral`, `amber`, `berry`, `violet`, etc.)
- `paletteId`, `setPalette`, `mode` (`"light" | "dark"`), `toggle`, `setFamily`, `setMode`

Consume via `const { theme } = useTheme()`. ThemeProvider also writes `widget_theme.json` on Android so widgets pick up accent colors.

`AppSettingsContext` (`src/theme/AppSettingsContext.tsx`) stores font family, font size scale, and other per-user preferences separately from the palette.

### Global font patch (`src/theme/globalFont.ts`)

`applyGlobalFontPatch()` is called once at module scope in App.tsx. It monkey-patches `Text.render` and `TextInput.render` to inject `fontFamily` derived from the current `FontFamilyKey` setting. No per-screen work needed.

**Nunito weight mapping**: Nunito ships one static file per weight. `NUNITO_WEIGHT_MAP` in `src/theme/fontSystem.ts` maps each `fontWeight` value to the correct loaded family name:

| fontWeight | Loaded family |
|---|---|
| 100–400, normal | `Nunito_400Regular` |
| 500 | `Nunito_500Medium` |
| 600 | `Nunito_600SemiBold` |
| 700, bold | `Nunito_700Bold` |
| 800–900 | `Nunito_800ExtraBold` |

When `currentFamily === "Nunito"`, the patch sets `fontWeight: "normal"` alongside `fontFamily` so Android does not re-synthesize bold on top of an already-bold file.

Available font families: `Nunito` (default), `System` (SF Pro/Roboto), `Serif` (Georgia/Noto Serif), `Monospace` (Courier New/Droid Mono). Font size scale: `compact` (0.875×), `default` (1.0×), `large` (1.125×), `xlarge` (1.25×) — multiplies ON TOP of the OS accessibility scale.

**Cross-reference**: `docs/UX_UI.md` for design rules, color token usage, card shadows, and screen layout conventions.

---

## 4. Error handling

`AppErrorBoundary` (`src/components/AppErrorBoundary.tsx`) is a React class component that catches render errors. It is placed:

1. Around each auth-state subtree in App.tsx (`login`, `signup`, `onboarding`, `app`).
2. Inside `RootTabs` wrapping the `NavigationContainer`.

On error: renders a dark diagnostic screen with the error message and stack. In `__DEV__`, also fires `console.error` with message, stack, and component tree. In production, the user sees the diagnostic UI but no console output.

Convention for async errors: screens use `try/catch` + local state for user-visible error messages. `__DEV__` gates verbose `console.error` calls. Network errors surface via `OfflineBanner`; ephemeral feedback uses the toast system (`src/lib/toast.ts` + `ToastHost`).

---

## 5. Platform extras

### Android home-screen widget

`plugins/withAndroidWidget.js` — Expo config plugin that injects Android widget XML, layout, and provider into the build. Widget reads auth from `widget_auth.json` and theme accents from `widget_theme.json` (both written by the main app process). Widget-scoped JWT (`/api/auth/widget-token`) limits access to widget-safe endpoints only.

### Android app shortcuts

`plugins/withAndroidShortcuts.js` — injects static shortcut intent-filters. Shortcuts trigger `ripple://log-water` etc., handled by the deep-link router in App.tsx.

### Wear OS tile

`plugins/withWearOsTile.js` — native Wear OS tile config plugin. `src/screens/WatchTilesScreen.tsx` provides the in-app management UI for tile data.

### Foreground service

`plugins/withForegroundServiceType.js` — sets `foregroundServiceType="health"` in the manifest, required for Health Connect background reads. `src/lib/foregroundService.ts` manages starting/stopping the service.

### Scripts

`scripts/generate-icons.mjs` — regenerates app icon assets. `scripts/reset-project.js` — dev environment reset helper.

---

## 6. Build & release

### EAS profiles (`eas.json`)

| Profile | Distribution | Build type | autoIncrement |
|---|---|---|---|
| `development` | internal | dev client | no |
| `preview` | internal | APK | **yes** |
| `production` | internal | APK | **yes** |

`autoIncrement: true` on `preview` and `production` means **EAS owns the effective versionCode** — it increments past whatever is in `app.json`. Despite this, policy requires bumping `app.json version`, `android.versionCode`, and `package.json version` before every preview build so the human-readable version stays in sync.

Current: `app.json version: "1.4.1"`, `versionCode: 20`. Bundle IDs: `com.kellehs.wellness` (iOS + Android).

### Build policy (enforce strictly)

- **NEVER run `eas build` unless the user explicitly says "build now".**
- JS-only changes (screens, styles, navigation, API calls) need no build — test in Expo Go or dev client.
- Batch all native-touching changes (new packages with native modules, permissions, icon assets, plugin config) before triggering a single build.
- Before any preview build: fast-forward `master` to `dev` and push both remotes (see git remote policy in memory).

### Dev client vs Expo Go

- **Expo Go** (dev): works for JS-only changes; cannot run `@notifee/react-native` or native modules that require a custom dev client build.
- **Dev client** (`development` profile): required when native modules are added or changed.
- Dev metro port: **8082**; production: **8081**.

### Dev login shortcut

`LoginScreen` in `__DEV__` mode may expose a shortcut to pre-fill credentials from env or hardcoded dev values. Confirm by reading `src/screens/LoginScreen.tsx` — the shortcut is env-gated (check `EXPO_PUBLIC_DEV_SHORTCUT` or similar). Do not expose in production builds.

---

## 7. Known constraints / cannot-do

These items require native rebuilds (`npm install` + EAS build) or are outside pure JS scope. Batch native items before any build.

### Requires npm install + EAS build (yellow tier)

- React Native Skia (`@shopify/react-native-skia`) — needed for advanced chart primitives, animated counters, weather backgrounds, Skia breathing overlay
- Shopify FlashList (`@shopify/flash-list`) — high-performance list alternative
- `@gorhom/bottom-sheet` — native bottom sheet with snapping
- `react-native-ios-context-menu` — native iOS context menus
- `lottie-react-native` — Lottie milestone celebration animations
- `@react-native-voice/voice` or `expo-speech` — voice input
- `react-native-mmkv` — fast key-value store (for command palette recent items)
- `expo-av` — chart sonification
- Shared-element transitions (Reanimated 3 is installed — verify if usable without a native rebuild first)
- Deep + universal links require `app.json` intent-filter + Apple entitlement changes

### Requires native code / design / product decisions / paid services (red tier)

- **iOS Live Activities + Dynamic Island** — SwiftUI, requires eject/prebuild
- **watchOS complication** — requires separate WatchKit target
- **App Clips / Instant Apps** — native entitlement setup
- **Custom icon set** (30 icons) — needs a designer
- **Lottie animation files** — needs design assets
- **Visual regression / A/B / session replay** — needs paid accounts (Chromatic, Percy, GrowthBook, PostHog)
- **Swipe-between-tabs crossfade** — `createBottomTabNavigator` does not support it natively; would require migrating to `createMaterialTopTabNavigator` or a custom gesture navigator
- `react-native-screens` swipe-back progress configuration
- Multiple dashboard variants (morning/workout/wind-down) — product decision needed
- User-defined Finance categories — replaces built-in taxonomy (product decision)
- Onboarding refactor (1,142-line file) — needs flow ordering decision

### Navigation notes

- Tab swipe gestures and animated crossfade between tabs are **not supported** by `createBottomTabNavigator`. Tabs are lazily mounted by default; eager-mounting all 7 at startup would increase launch time with no benefit.
- Tabs are accessed programmatically via `navigation.getParent()?.navigate(...)` from within the tab bar's header buttons.
- Settings permission screens (notifications, battery, Health Connect) **must** re-check actual system state on `useFocusEffect`, not just on mount — users navigate away to Android settings and return.

### UI copy constraints

- Single data point: gentle observation only ("glucose climbed after lunch today").
- Repeated pattern: cite the count ("4 of the last 5 days").
- Never phrase correlations as medical advice or causal claims.
