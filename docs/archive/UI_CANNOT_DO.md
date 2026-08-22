# UI Upgrades — What I Can't Do In-Session

Companion to `UI_UPGRADES.md`. Split into two tiers:
🟡 = needs your OK on a package install + eventual EAS build
🔴 = requires native code / designer / product decisions / paid external services

## 🟡 Doable, but requires `npm install` + a native rebuild

Per memory rule: I never run `eas build` without your explicit "build now."
Per memory rule: batch native-touching changes together, then one build.

- [ ] 1.2  React Native Skia — needs `@shopify/react-native-skia` (native)
- [ ] 1.3  Shopify FlashList — needs `@shopify/flash-list`
- [ ] 1.6  react-native-worklets-core (may ship with Reanimated already; verify)
- [ ] 3.1  Full unified chart primitives library (Line/Bar/Area/Gauge/Heatmap/Cal/Stack) — depends on Skia (§1.2)
- [ ] 3.2  Interactive chart scrubbing — depends on Skia + gesture-handler
- [ ] 3.3  Chart-point annotations — depends on §3.1
- [ ] 3.4  Pinch-zoom + swipe-pan date ranges — depends on gesture-handler
- [ ] 3.5  Dual-metric comparison overlay — depends on §3.1
- [ ] 3.7  Calendar heatmap (GitHub-style) — depends on §3.1
- [ ] 3.8  Skia-based animated number counters — depends on Skia (JS fallback shipped)
- [ ] 3.11 Chart sonification — needs `expo-av`
- [ ] 4.2  react-native-gesture-handler adoption (already installed as Reanimated peer; verify + upgrade usage)
- [ ] 4.3  @gorhom/bottom-sheet — needs `@gorhom/bottom-sheet`
- [ ] 4.4  Native iOS context menus — needs `react-native-ios-context-menu` (native)
- [ ] 6.4  Shared-element transitions (Reanimated 3 already installed; may work — verify)
- [ ] 6.7  Native swipe-back progress — needs `react-native-screens` config
- [ ] 6.8  Persistent mini-player pattern — pure JS but nav-config heavy
- [ ] 6.10 Deep + universal links — needs app.json intent-filter + Apple entitlement
- [ ] 7.1  Confetti + Lottie tiers — needs `lottie-react-native` (native) + Lottie files (design)
- [ ] 7.9  Weather-reactive backgrounds — needs Skia (§1.2)
- [ ] 7.10 Skia breathing overlay — depends on Skia (§1.2)
- [ ] 14.1 Full command palette (fuzzy engine + native modal) — pure JS scaffold possible; production needs `react-native-mmkv` for recent items
- [ ] 14.2 Recent + suggested surfaces on search — depends on §14.1
- [ ] 14.3 Voice input — needs `@react-native-voice/voice` or `expo-speech`

## 🔴 Not in my lane — needs native code, a designer, product decisions, or paid services

### Native (SwiftUI / Kotlin / Xcode / Android Studio, plus Expo eject or prebuild)
- [ ] 10.1 iOS Live Activities + Dynamic Island
- [ ] 10.2 Android home widgets
- [ ] 10.3 watchOS complication
- [ ] 10.4 Wear OS tile
- [ ] 10.5 Siri Shortcuts + Android App Shortcuts (native intents)
- [ ] 10.6 App Clips / Instant Apps
- [ ] 10.7 Handoff across phone ↔ tablet (Apple entitlement)

### Design work (no source assets exist to work from)
- [ ] 2.5 Custom 30-icon Ripple icon set (needs a real designer)
- [ ] 7.1 Lottie milestone celebration files
- [ ] 9.6 Achievement journey-map illustration set
- [ ] 11.1 Instagram-story share-card template design (I can scaffold Skia code; you need the visual)

### Heavy multi-day projects requiring a video / media pipeline
- [ ] 11.4 Screen-recording of trend animations
- [ ] 11.5 Weekly recap video (auto-generated TikTok-style)

### External services + paid accounts
- [ ] 15.1 Visual regression (Chromatic or Percy — needs paid account + CI)
- [ ] 15.3 Design-token diff bot (needs GitHub Actions setup)
- [ ] 15.4 A/B experimentation harness (GrowthBook or Statsig account)
- [ ] 15.5 User session replay (LogRocket / PostHog account)

### Product decisions I shouldn't make unilaterally
- [ ] 8.3 Pinned rail — I can build; product needs to define pinning UX
- [ ] 8.4 Multiple dashboard variants (morning/workout/wind-down) — content curation
- [ ] 8.5 Widget-style tile sizing per metric — layout system rewrite
- [ ] 8.6 User-defined Finance categories — replaces built-in taxonomy
- [ ] 9.2 Onboarding refactor (1,142 lines) — needs your call on flow ordering
- [ ] 9.4 Feature-discovery carousel — needs content strategy for the weekly pick

---

**If you want any of the 🟡 items**, tell me which and I'll `npm install` + write the code, batched for one clean EAS build later.
**If you want any of the 🔴 items**, we need to plan them separately — most involve you or a designer.
