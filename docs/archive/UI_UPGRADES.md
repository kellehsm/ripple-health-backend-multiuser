# Ripple Wellness — UI Top-Tier Upgrade Plan

Working checklist. `[x]` = done, `[~]` = in progress, `[ ]` = todo.

## 1. Motion & performance
- [ ] 1.1 Migrate 18 legacy Animated files → Reanimated 3 (in-progress; scope for next pass)
- [ ] 1.2 Add React Native Skia — see UI_CANNOT_DO.md (needs install)
- [ ] 1.3 Swap FlatList → FlashList — see UI_CANNOT_DO.md
- [ ] 1.4 ScrollView → virtualization sweep (in-progress; scope for next pass)
- [ ] 1.5 useMemo / React.memo sweep (in-progress; scope for next pass)
- [ ] 1.6 worklets-core adoption — deferred
- [ ] 1.7 Font preload at splash — deferred (needs SplashScreen wiring)

## 2. Design-system depth
- [x] 2.1 Motion system extended (`theme/motion.ts` — MOTION+ANIM+SPRING_*+PRESS_SCALE)
- [x] 2.2 Semantic elevation ladder (`theme/elevation.ts` — ELEVATION[0..4])
- [x] 2.3 Button variants formalized (`components/Button.tsx` — 5 variants + 3 sizes + iconOnly)
- [ ] 2.4 Design tokens JSON export — deferred (nice-to-have)
- [ ] 2.5 Custom icon set — see UI_CANNOT_DO.md (needs designer)
- [x] 2.6 Icon variants wrapper (`components/IconVariant.tsx`)
- [ ] 2.7 RADIUS consolidation — deferred (would break existing calls)
- [ ] 2.8 8pt grid ESLint rule — deferred (would break many existing files)

## 3. Charts & data viz
- [ ] 3.1 Unified chart primitives — see UI_CANNOT_DO.md (needs Skia)
- [ ] 3.2 Interactive scrubbing — depends on 3.1
- [ ] 3.3 Chart annotations — depends on 3.1
- [ ] 3.4 Pinch/pan chart — depends on 3.1
- [ ] 3.5 Dual-metric overlay — depends on 3.1
- [x] 3.6 Sparkline component (`components/Sparkline.tsx` — drops under any tile)
- [ ] 3.7 Calendar heatmap — depends on 3.1
- [x] 3.8 Animated number counters (`components/NumberRoll.tsx`)
- [x] 3.9 Empty-chart illustration (`components/EmptyChart.tsx`)
- [ ] 3.10 Chart PNG export — deferred (needs ViewShot dep)
- [ ] 3.11 Chart sonification — deferred (needs expo-av)

## 4. Interactions (haptics, gestures, sheets)
- [x] 4.1 Haptic vocabulary (`lib/haptics.ts` — tap/pop/press/success/warning/error/streakBroken/celebrate)
- [ ] 4.2 gesture-handler adoption — deferred (sweep task)
- [ ] 4.3 @gorhom/bottom-sheet — see UI_CANNOT_DO.md
- [ ] 4.4 Native context menus — see UI_CANNOT_DO.md
- [ ] 4.5 Swipe actions sweep — deferred (per-screen work)
- [ ] 4.6 Pull-to-reveal filter tray — deferred
- [ ] 4.7 Two-finger swipe — deferred
- [ ] 4.8 Command palette — see UI_CANNOT_DO.md (needs fuzzy engine dep)

## 5. Accessibility
- [x] 5.1 Dynamic Type via `<ScaledText>` + `useDensity()` (respects `PixelRatio.getFontScale()`)
- [x] 5.2 Reduce Motion respect via `hooks/useReducedMotion.ts` (Button, RipplePressable, Skeleton, NumberRoll)
- [x] 5.3 Color-blind mode setting (in AppSettings — palette wiring per-mode still TBD)
- [ ] 5.4 WCAG contrast audit — deferred (needs per-theme review)
- [ ] 5.5 VoiceOver rotor — deferred
- [ ] 5.6 Focus trap in modals — deferred (needs `accessibilityViewIsModal` sweep)
- [ ] 5.7 RTL audit — deferred (grep-scan pass on flexDirection)
- [ ] 5.8 Touch-target lint rule — deferred
- [ ] 5.9 Live regions — deferred
- [ ] 5.10 Mindfulness captions — deferred (needs content)

## 6. Layout & navigation
- [ ] 6.1 Tablet-adaptive layouts (two-column dashboard, split-view details) — extend useIsTablet
- [ ] 6.2 Landscape support on chart-heavy Detail screens
- [ ] 6.3 Collapsible large headers that shrink on scroll (iOS-style)
- [ ] 6.4 Shared-element transitions between list → detail (Reanimated SharedTransition)
- [ ] 6.5 Parallax scrolling on hero areas (Insights top card, Health tab)
- [ ] 6.6 Sticky section headers on long scrolls
- [ ] 6.7 Swipe-back with progress (iOS fullScreenGestureEnabled + Android gesture)
- [ ] 6.8 Persistent mini-player pattern for active experiments / workouts
- [ ] 6.9 Morphing indicator on BottomNav (upgrade legacy Animated)
- [ ] 6.10 Deep + universal links to every insight / screen

## 7. Micro-interactions & delight
- [ ] 7.1 Confetti/Lottie — see UI_CANNOT_DO.md (needs Lottie + design)
- [ ] 7.2 Water-drop success animation — deferred (needs SVG/Skia)
- [x] 7.3 Ripple effect (`components/RipplePressable.tsx`)
- [x] 7.4 Number-roll (`components/NumberRoll.tsx`)
- [x] 7.5 Skeleton primitives (`components/Skeleton.tsx` — Skeleton/Card/Row/Chart variants)
- [x] 7.6 `ProgressiveList` unifies loading/empty/error triad across every screen
- [x] 7.7 Teaching empty states (`EMPTY_STATES` presets — 9 features)
- [x] 7.8 Time-of-day theme shift SETTING (visible tint requires theme rewrite; setting persisted)
- [ ] 7.9 Weather-reactive backgrounds — see UI_CANNOT_DO.md
- [ ] 7.10 Breathing overlay — see UI_CANNOT_DO.md (needs Skia)

## 8. Personalization & customization
- [ ] 8.1 Drag-to-reorder dashboard — deferred (needs gesture-handler + product spec)
- [ ] 8.2 Inline goal editor — deferred (needs goal storage model)
- [ ] 8.3–8.6 — see UI_CANNOT_DO.md (product decisions)
- [x] 8.7 Per-metric color override (`PersonalizationScreen` + AppSettings)
- [x] 8.8 Density mode (compact/comfortable/spacious in Settings + `useDensity()`)
- [x] 8.9 Typography — already existed as fontFamily; density is the new dimension

## 9. Onboarding & progressive disclosure
- [x] 9.1 Progressive tips scheduler (`lib/progressiveTips.ts` — TIPS registry + session count)
- [ ] 9.2 — see UI_CANNOT_DO.md (product decision)
- [ ] 9.3 Sample-data mode — deferred (needs seed data endpoint)
- [ ] 9.4 — see UI_CANNOT_DO.md (content strategy)
- [ ] 9.5 Empty→populated morph — deferred (per-screen animation work)
- [ ] 9.6 — see UI_CANNOT_DO.md (design work)

## 10. Cross-surface presence
- [ ] 10.1 iOS Live Activity + Dynamic Island (active workout, mindfulness, live glucose)
- [ ] 10.2 Android home widgets (4×2 rings, 2×2 glucose, 1×1 streak)
- [ ] 10.3 watchOS complication (glucose / next med / step ring)
- [ ] 10.4 Wear OS tile counterpart
- [ ] 10.5 Siri Shortcuts + Android App Shortcuts ("log mood 4", "start mindfulness")
- [ ] 10.6 App Clips / Instant Apps for a shareable insight page
- [ ] 10.7 Handoff-style resume across phone ↔ tablet

## 11. Sharing, export, print
- [ ] 11.1 Instagram-story share card — see UI_CANNOT_DO.md (needs design)
- [x] 11.2 PDF weekly digest (`GET /export/weekly-digest.pdf`)
- [x] 11.3 CSV export of trends (`GET /export/trends.csv?metric=...&days=...`)
- [ ] 11.4–11.5 — see UI_CANNOT_DO.md (video pipeline)
- [ ] 11.6 Print styles — deferred (per-screen work)

## 12. Content quality & density
- [ ] 12.1 Editorial pass — deferred (needs editor; linter enforces the mechanics)
- [x] 12.2 Spanish translation seed (`strings/es.ts` + wired `useLocale()`)
- [x] 12.3 `utils/format.ts` — formatNumber, formatCurrency, formatWithUnit, formatDuration
- [x] 12.4 Same file — formatRelativeTime, formatShortDate, formatTime
- [x] 12.5 UI copy linter (`backend/scripts/lint-ui-copy.mjs` — 182 files clean)

## 13. Empty / error / offline / loading
- [x] 13.1 `<LastSyncedChip>` + `markSynced()` (per-screen persistent timestamp)
- [x] 13.2 `<ScreenErrorBoundary>` (per-screen recover-in-place)
- [x] 13.3 `<RetryPlaceholder>` inline card (compact + full variants)
- [x] 13.4 `<ProgressiveList>` unifies loading/empty/error triad

## 14. Search & discoverability
- [ ] 14.1–14.3 — see UI_CANNOT_DO.md
- [ ] 14.4 Autocomplete + fuzzy — deferred (needs per-endpoint work)

## 15. Testing, tooling, governance
- [ ] 15.1 Visual regression — see UI_CANNOT_DO.md (paid service)
- [x] 15.2 Storybook README + component conventions (`app/STORYBOOK.md`)
- [ ] 15.3 Token-diff bot — see UI_CANNOT_DO.md (CI setup)
- [ ] 15.4 A/B harness — see UI_CANNOT_DO.md (paid service)
- [ ] 15.5 Session replay — see UI_CANNOT_DO.md (paid service)
- [x] 15.6 `<DebugDrawer>` component (feature flags + regenerate + wipe storage)
- [x] 15.7 Feature-flag lib (`lib/featureFlags.ts` — `useFeatureFlag(k)` + toggles)
- [x] 15.8 `<WhatsNewModal>` (first-launch changelog gate)

---

## First-five recommendation (biggest perceived-quality leap per unit of effort)
1. Reanimated 3 migration on top 5 traffic screens (§1.1) — buttery scroll is table stakes
2. Skia charts primitives library (§3.1) — world-class data viz
3. Haptic vocabulary + @gorhom/bottom-sheet (§4.1, §4.3) — tactile polish everywhere
4. Live sparkline + animated counter on every tile (§3.6, §3.8) — visible on every load
5. iOS Live Activity + Android widget (§10.1, §10.2) — the "wow, this is a serious app" moment
