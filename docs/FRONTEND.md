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
| `components/` | ~55 shared UI components: cards, modals, sheets, banners, forms, loaders. Reusable animation components: `CountUpText.tsx` (animated number count-up), `AnimatedProgressRing.tsx` (SVG arc sweep on mount), `ConfettiBurst.tsx` (particle burst on milestone). |
| `constants/` | `dashboardCards.ts`, `moodCategories.ts`, `index.ts` |
| `context/` | `TabPreferencesContext.tsx` — tab ordering/visibility state |
| `hooks/` | `useHaptic`, `useModals`, `usePressScale`, `useReduceMotion` (returns `boolean`; screens skip animations when true — use in all new animated screens), `useTabPreferences` |
| `lib/` | Stateful platform helpers: `auth.ts`, `biometricLock.ts`, `fastingTimer.ts`, `foregroundService.ts`, `healthConnect.ts`, `insightAlerts.ts`, `notifeeSafe.ts`, `smartNotifications.ts`, `timezone.ts`, `toast.ts`, etc. |
| `navigation/` | `RootTabs.tsx` (NavigationContainer + stack + tab navigator), `navigationRef.ts` |
| `onboarding/` | `featureIntros.ts`, `useFeatureIntro.ts` — per-feature first-time flows |
| `screens/` | ~45 screens; sub-components of large screens live in `screens/settings/`, `screens/health/`, `screens/overview/`, `screens/meals/`, `screens/mindfulness/` (extracted-section pattern: typed props, parent owns cross-section state, styles move with the component; Overview also has a `useOverviewData` data-loading hook) |
| `strings/` | `StringsContext.tsx` + `defaults.ts` — i18n-ready string overrides |
| `theme/` | Design system (see §3) |
| `types/` | `substances.ts`, `tabPreferences.ts` |
| `utils/` | Pure helpers: `dateUtils`, `syncQueue`, `networkState`, `staleCache`, `errorReport`, barcode cache, formatters |

### Navigation architecture

Two-level navigation inside `RootTabs.tsx`:

**Root stack** (`createNativeStackNavigator`): `Tabs` (headerShown: false) + ~37 named screens pushed on top — Settings, History, all detail screens (Steps/HeartRate/Sleep/`GlucoseDetail`), Insights, Mindfulness, Chat, ExerciseSession, Friends, Challenges, Leaderboard, Medication flows, Experiments, monthly recap, watch tiles, `WaterDetail` (navigated from the water chip on HealthScreen), `SettingsFeatureGuide` (`src/screens/settings/FeatureGuideScreen.tsx`), etc.

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
- **Drain wiring (App.tsx):** `processSyncQueue()` is called via a `flushSyncQueue()` wrapper that guards against concurrent invocations using a `syncInFlight` ref. It fires on: (1) app startup, (2) every `AppState → "active"` event, and (3) every network-reconnect event via `subscribeNetwork`. Previously the queue existed but was never automatically drained — this wiring ships as of the 2026-08 audit pass.
- `src/utils/staleSyncState.ts` and `StaleSyncBanner` expose the pending-item count to the UI.
- `src/utils/networkState.ts` tracks online/offline state; components subscribe via `OfflineBanner`.

---

## 3. Theme system

### Icon slot system (`src/theme/iconRegistry.tsx`)

The registry maps named slots to emoji or Ionicons assets. As of the current dev branch it contains **126 slots**. Prefixes added in this pass:

| Prefix | Example slots |
|---|---|
| `empty.*` | `empty.books`, `empty.heart`, `empty.trend`, `empty.glucose`, `empty.steps`, `empty.insights`, `empty.default`, … |
| `medHistory.*` | `medHistory.added`, `medHistory.dose_changed`, `medHistory.stopped`, … |
| `exerciseSuggestion.*` | `exerciseSuggestion.rest_day`, `exerciseSuggestion.neglected_muscle`, `exerciseSuggestion.program_gap`, … |
| `mindfulness.*` | session types |
| `milestone.*` | achievement tiers |
| `social.*` | friend / challenge icons |
| `health.*` | generic health metric icons |

Greeting updates: `greeting.evening` → 🌆; `greeting.night` added → 🌙.

**Policy:** No icon-like emoji may be hardcoded directly in screens or components. Every icon-like emoji must render via `<ThemedIcon slot="..." />` so that `theme.iconOverrides` applies consistently. If no existing slot fits, add one. Exempt from this rule: inline sentence/copy emoji (e.g. "Great job 🎉") and user-generated data.

**Image asset `scale`:** `ImageAsset`/`UriAsset` accept an optional `scale` multiplier applied to the slot's requested size, for illustration icons that read too small at emoji-equivalent sizes. Cozy Cat uses 1.35 for content icons and 2.6 for tab-bar slots (`tab.home`, `tab.meals`, `tab.exercise`, `tab.wellness`, `tab.hobbies`). The greeting cat renders to the **right** of the greeting text at 128px in `HeaderCard` when an image override exists for the slot.

**`EmptyState` component** (`src/components/EmptyState.tsx`) accepts a `slot` prop that resolves the icon through `iconRegistry`, taking precedence over a raw `icon`/`emoji` prop.

### Health Connect (`src/lib/healthConnect.ts`)

- `ensureInitialized()` guard prevents stale-handle calls after permission revoke; `resetHCInitialized()` resets the flag so the next sync/permission call re-runs `initialize()`.
- `syncHealthData` returns a graceful errors array (instead of throwing) when Health Connect is unavailable or permissions have been revoked — callers inspect `errors[]` rather than catching.
- HR sync window: **30 days** (rolling, picks up Samsung Health's delayed backfill).

### Theme Studio preview (`src/screens/settings/ThemePreviewFrame.tsx`)

The "LIVE PREVIEW" panel in `AppearanceSettingsScreen` renders the **actual screen components** inside a scaled 320×560 phone frame (scale 0.52).

**Architecture:**
- `src/theme/ThemeEditContext.tsx` — `{ editMode, selectedId, selectElement }` context. Default value has `editMode: false` so the rest of the app is unaffected.
- `ShadowCard` consumes `ThemeEditContext`. When `editMode=true` and the card has a `cardId`/`tileId`, taps call `selectElement(objectId, kind)` instead of `onPress`; a primary-colored highlight glow renders when `selectedId === objectId`.
- `ThemePreviewFrame` wraps the frame content in `ThemeEditContext.Provider` with `editMode=true`. It uses **`NavigationIndependentTree`** (from `@react-navigation/core`, v7 API) + `NavigationContainer` to host a minimal `createNativeStackNavigator` containing just the selected page's real screen component. The screens fetch live API data — real user data appears in the preview.
- Page chips map keys to actual screen components: overview→OverviewScreen, wellness→HealthScreen, meals→MealsScreen, life→LifeScreen, finance→FinanceScreen, health_tab→HealthTabScreen, exercise→ExerciseScreen, mindfulness→MindfulnessScreen, insights→InsightsScreen.
- An `ScreenErrorBoundary` (local class component) catches screen render errors and shows a caption fallback instead of crashing.
- Scale/touch math: the phone-outer View is rendered at full size with `transform:[{scale:0.52}]`. Because scale is center-origin, layout collapse uses **symmetric** negative margins — `marginHorizontal`/`marginVertical` of `−(full_dim × (1 − 0.52)) / 2` per axis — so the frame stays centered. Touch coordinates align automatically because RN hit-testing follows the scaled visual bounds.
- Page background editing: a small "Edit page background" button above the frame opens the same `ElementEditor` modal with `kind:"page"` and a per-page element ID.
- Tap-to-edit flow: ShadowCard tap → `selectElement` → sets `selected` state in `ThemePreviewFrame` → `ElementEditor` modal opens bound to `AppSettingsContext` setters (opacity, glass blur, background image).

### Chart performance & accessibility (2026-08 audit)

All react-native-svg chart components follow three rules:
1. **Geometry in `useMemo`** — point arrays, polyline/path strings, bar/tick coordinates are memoized on their data + dimension inputs; never recomputed inline per render. Leaf chart components are wrapped in `React.memo` where prop references are stable.
2. **Scrub haptics** — pan-scrub charts (glucose in `HealthScreen` `onScrub`, trends scatter in `TrendsScreen` `handleScrub`) fire `Haptics.selectionAsync()` only when the snapped data point changes, guarded by a ref of the last index/timestamp.
3. **Screen-reader traits** — data charts carry `accessible` + `accessibilityRole="image"` + a data-summarizing `accessibilityLabel` (latest value, range, count). Decorative rings sitting next to a visible value Text are hidden instead (`accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`).

There is **no jest test suite** in this repo; chart refactors are validated by `npx tsc --noEmit` (26 known pre-existing errors) plus a web-bundle smoke test on Ripple Preview.

### Tokens (`src/theme/tokens.ts`)

Shared numeric constants: `FONT_SIZES` (micro 9 → display 28), `SPACING` (xs 4 → xxl 32), `RADIUS` (sm 8 → card 18, pill 100).

### Palettes and ThemeContext

`src/theme/palettes.ts` defines named `Theme` objects (light and dark variants). The active palette is persisted to SecureStore under `ripple_palette_id`. Default is `"morning-mist"` (cream light theme).

**Top/bottom bar colors:** `Theme` has optional `topBar` and `bottomBar` tokens. `RootTabs` uses `theme.topBar ?? theme.teal.tint` for the Home tab header (other tabs keep their per-tab family tints). `BottomNav` uses `theme.bottomBar ?? theme.topBar ?? theme.page`, so the bottom tab bar can stand apart from the page background.

**Web target — "Ripple Preview":** the dev web build served at http://app.kels.gg:8090 (http://129.121.125.214:8090) is called **Ripple Preview**. The app runs on react-native-web via `npx expo start --web`. `metro.config.js` adds wasm asset support, COOP/COEP headers, and web-only resolver aliases (expo-secure-store → localStorage shim, react-native-svg `resolve` → style-flattening shim). Platform files `localDb.web.ts` (no-op SQLite) and `plaidLink.web.ts` (stub) exclude native-only modules from the web bundle. `globalFont.ts` must flatten styles (`StyleSheet.flatten`) before cloning — style arrays crash React DOM.

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

`modules/ripple-widget-sync/` — local Expo module (autolinked from `modules/`) exposing `RippleWidgetSync.syncNow()`, which broadcasts `WIDGET_WEAR_SYNC` to the widget provider to refetch + push metrics to the watch (works with no widgets pinned). JS wrapper: `src/lib/widgetSync.ts` (`syncWidgetAndWatch()` — no-op off Android or when the module is absent, e.g. Expo Go).

### Foreground service

`plugins/withForegroundServiceType.js` — sets `foregroundServiceType="health"` in the manifest, required for Health Connect background reads. `src/lib/foregroundService.ts` manages starting/stopping the service.

### Scripts

`scripts/generate-icons.mjs` — regenerates app icon assets. `scripts/reset-project.js` — dev environment reset helper.

---

## 6. Build & release

### Builds are LOCAL (user-run)

Builds run **locally on the user's machine**, not on EAS servers — but Claude may run them **when the user asks**. `eas.json` still exists (profiles: development/preview/production, autoIncrement on preview+production); since builds are local, `app.json android.versionCode` is authoritative.

Current: `app.json version: "1.5.0"`, `versionCode: 22`. Bundle IDs: `com.kellehs.wellness` (iOS + Android).

### Build policy (enforce strictly)

- **Never start a build unprompted; always run one when asked.** "do a build" / "build now" / "local build" authorizes a local build — no further confirmation needed.
- **Local build command:** `eas build --platform android --profile preview --local`. Run it with `TMPDIR` and `EAS_LOCAL_BUILD_WORKINGDIR` pointed at a directory on a real disk (e.g. `~/.cache/eas-local-build`) — the default `/tmp` is a ~7.5 GB tmpfs and the ~6 GB workdir exhausts it, which kills the build mid-gradle with confusing "Disk quota exceeded" / truncated-log symptoms. Takes ~15 min; APK lands in the project root as `build-<timestamp>.apk` with the wear app embedded as a micro-APK.
- **Remote EAS builds stay off-limits** (limited credits) unless the user explicitly asks for a remote build.
- When native changes are ready but no build was requested, bump `app.json version` + `android.versionCode` + `package.json version`, merge `dev`→`master` and push both remotes, then tell the user it's ready to build.
- JS-only changes (screens, styles, navigation, API calls) need no build — test in Expo Go or dev client.
- Batch all native-touching changes (new packages with native modules, permissions, icon assets, plugin config, Kotlin in `plugins/`) into the running "pending native changes" list below.

### Pending native changes (batched for next local build)

Shipped in git (1.5.0 / vc 22) but require a native rebuild to reach devices:

- **Watch breathing activity** — redesigned layout + BoxAnimView + ripple animations (`RippleWearBreathingActivity.kt`, `RippleWearBreatheTileService.kt`, `RippleWearLogTileService.kt`, `RippleWearMainActivity.kt`).
- **Widget sleep path fix** — `RippleWidgetProvider.kt` corrected to call `/api/health-connect/sleep/stats` (was 404ing on wrong path).
- **New Android Health Connect permissions** in `app.json`: `READ_EXERCISE`, `READ_BODY_MEASUREMENTS`, `READ_OXYGEN_SATURATION` (enables `sync_exercise` / `sync_weight` / `sync_spo2` toggles in Health Connect settings).
- **expo-image-picker** (new native module) — gallery photo selection for the meal photo scanner (`PhotoScannerModal`, "Pick from photos" in the add-food sheet).
- **Watch swipeable insights** — multi-insight ViewFlipper on the wear main activity (`RippleWidgetProvider.kt`, `WearDataBridge.kt.template`, `WearDataListenerService.kt`, `WearCache.kt`, `RippleWearMainActivity.kt`).
- **ripple-widget-sync local Expo module** — app-triggered widget/watch refresh (`WIDGET_WEAR_SYNC` action in `RippleWidgetProvider.kt`); fixes watch never getting steps/sleep without a pinned widget and stale water counts after in-app logs.
- **Round-screen padding fix** — `RippleWearMainActivity.kt` pads 48/52dp top/bottom on round faces so the title clears the bezel.
- **Watch/widget polish wave (2026-08)** — urgent-glucose double-buzz haptic with 15-min debounce (`WearDataListenerService.kt`), "Updated X" timestamp + mood stat row + water progress arc on the watch home screen (`RippleWearMainActivity.kt`), mood pushed through the data bridge (`WearDataBridge.kt.template`, `WearCache.kt`), "phone not reachable" state instead of silent optimistic bumps in `RippleWearLogActivity.kt`, breathing screen dims to 1% brightness after 60 s (touch restores; `RippleWearBreathingActivity.kt`), widget mood-trend dot strip (`RippleWidgetProvider.kt`, `ripple_widget.xml`).
- **Widget review wave (2026-08-24)** — robustness: 30-min backup refresh alarm (`onEnabled`/`onDisabled`), `runAsync` watchdog releases `goAsync()` within 9 s (ANR guard), per-widget-id PendingIntent request codes, single `/mindfulness/stats` fetch per refresh, `HttpsURLConnection.disconnect()` in `finally`, score-card rotation moved from onUpdate drift to tap-to-advance (`ACTION_NEXT_STAT`); `withAndroidWidget.js` now rewrites `ACTION_WEAR_SYNC`/`ACTION_NEXT_STAT` for non-default package names and `ripple-widget-sync` builds its action/class from `context.packageName`. Features: exercise minutes on the steps chip sub-label, meal kcal in the meal chip, 🔥 mindfulness-streak header badge, ⚠ urgent-glucose label, 🧘 breathe deeplink button, toast feedback on widget water/mood logs. Polish: status text 11sp, tokenized compact-widget colors (dark mode fix), status-color hexes aligned to app tokens, emoji dropped from chip labels, contentDescriptions on all tap targets, insight flipper 12 s, water chips deeplink to `ripple://water`. New deeplink actions in `App.tsx`: `water`, `exercise`, `mindfulness`.

### Dev client vs Expo Go

- **Expo Go** (dev): works for JS-only changes; cannot run `@notifee/react-native` or native modules that require a custom dev client build.
- **Dev client** (`development` profile): required when native modules are added or changed.
- Dev metro port: **8082**; production: **8081**.
- Web dev server (expo start --web): port **8090** (`screen -S wellness-web`).

### Web platform metro aliases (`metro.config.js`)

Two packages need web shims registered in `config.resolver.resolveRequest`:

| Package | Issue | Shim |
|---|---|---|
| `expo-secure-store` | No web implementation | `src/lib/secureStore.web.stub.ts` |
| `react-native-svg` — `lib/resolve.js` | Returns style arrays (`[styleProp, cleanedProps]`) that crash React DOM on native SVG elements (`CSSStyleProperties indexed property setter` error) | `src/lib/rn-svg-resolve.web.stub.js` (flattens via `StyleSheet.flatten`) |

The react-native-svg shim is matched by `moduleName === "../../lib/resolve"` with `context.originModulePath.includes("react-native-svg")` to avoid false positives.

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

### Keyboard avoidance (soft keyboard)

- `app.json` `android.softwareKeyboardLayoutMode: "pan"` — Android pans the whole layout up when the keyboard opens, covering most cases globally.
- Screens/modals with TextInputs below the fold wrap their root in `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>`.
- ScrollViews that contain TextInputs use `keyboardShouldPersistTaps="handled"` so tapping list results doesn't dismiss the keyboard.
- Modal components with TextInputs wrap the overlay View in a KeyboardAvoidingView inside the Modal.
- Screens already correctly handled: `LoginScreen`, `SignupScreen`, `HistoryScreen` (uses `keyboardDismissMode`), `GlobalSearchScreen`, `MindfulnessScreen` (parent ScrollView has `keyboardShouldPersistTaps`).

### Navigation notes

- Tab swipe gestures and animated crossfade between tabs are **not supported** by `createBottomTabNavigator`. Tabs are lazily mounted by default; eager-mounting all 7 at startup would increase launch time with no benefit.
- Tabs are accessed programmatically via `navigation.getParent()?.navigate(...)` from within the tab bar's header buttons.
- Settings permission screens (notifications, battery, Health Connect) **must** re-check actual system state on `useFocusEffect`, not just on mount — users navigate away to Android settings and return.

### UI copy constraints

- Single data point: gentle observation only ("glucose climbed after lunch today").
- Repeated pattern: cite the count ("4 of the last 5 days").
- Never phrase correlations as medical advice or causal claims.
