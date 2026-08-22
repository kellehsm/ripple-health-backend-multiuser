# Ripple Wellness — Design System & UX Reference

> **Living document** — update whenever a design rule is added or changed.
> This file supersedes `STYLE_GUIDE.md` and `UI_UPGRADES.md` (both archived).

---

## 1. Design Language

Ripple Wellness is a warm, cozy companion — not a clinical dashboard. Surfaces feel like sunlit paper: cream backgrounds, soft amber shadows, and rounded shapes that invite daily check-ins rather than demanding them. Accent colors are vivid enough to pop against cream but always grounded in earthy hues (teal, coral, amber, berry) that feel organic rather than electric. Every interaction — from pull-to-refresh to metric chips — should feel gentle and rewarding, never cold or institutional.

---

## 2. Color System

All colors come from `src/theme/palettes.ts` via `useTheme()`. **Never hardcode hex values in screens.** The one exception: `PURPLE = "#9B59B6"` is permitted for legacy med/cycle code only.

### Surface tokens (morning-mist / reference palette)

| Token | Hex | Usage rule |
|---|---|---|
| `page` | `#F5ECDF` | Main screen background; use as the `backgroundColor` on the root `View` or `ScreenBackground` |
| `cream` | `#FAF5EE` | Subtlest inset — modal sheet backgrounds, input field fills |
| `card` | `#FEFCF8` | All card / surface backgrounds |
| `cardBorder` | `#C4B5A5` | **Container cards only** — neutral warm border; never use on stat chips |
| `ink` | `#1C2B3A` | Text, button borders, icon strokes |
| `textStrong` | `#1C2B3A` | Headings, primary values, body text |
| `textSoft` | `#4E6074` | Labels, captions, placeholders |
| `gradientEnd` | `#EDE5D5` | Far end of per-screen `LinearGradient` backgrounds |
| `primary` | `#2870C8` | Main CTA, active switches |
| `success` | `#1A9870` | Positive / in-range states |
| `warning` | `#B88820` | Caution / elevated values |
| `danger` | `#C02840` | Urgent alerts |

### Metric color families

Each family has five usable sub-tokens: `solid`, `bg`/`tint`, `fg`, `sub`, and `bar`.

| Family | Semantic role | `.solid` (morning-mist) | `.tint`/`.bg` |
|---|---|---|---|
| `teal` | Steps, activity, hobbies, books | `#1A9870` | `#D8F5EB` |
| `coral` | Food / meals | `#C85C28` | `#FBEACC` |
| `blue` | Water | `#2870C8` | `#DAE8FA` |
| `amber` | Sleep | `#B88820` | `#F8EEC8` |
| `purple` | Finance / spending | `#7830B8` | `#ECD8FA` |
| `berry` | Glucose, heart rate (in-range) | `#C02840` | `#FAE0E4` |
| `violet` | Mood | `#7838B8` | `#ECD8FA` |

**Sub-token usage rules:**
- `.solid` — chip/tile borders, progress bars, icon backgrounds, badge text color on dark
- `.tint` / `.bg` — chip/tile fill on light backgrounds; in dark mode these become very dark tints
- `.fg` — text color when rendering text on `.tint` background (always `textStrong` / near-black on light palettes)
- `.sub` — secondary text or darker accent label inside an already-tinted region
- `.bar` — progress/bar fill (defaults to `.solid`; use `teal.bar`, `berry.bar`, etc.)

**Golden border rule:**
- Stat chips: use `c.solid` as `borderColor`
- Container cards: use `theme.cardBorder` (never an accent solid)
- Hero banners (saturated bg): no border, or semi-transparent white

**Shadow color — always warm:** `rgba(60,40,20,0.1)` — never `"#000"` or `"rgba(0,0,0,...)"`.

### Permitted de-facto color patterns

Three patterns appear widely across the codebase and are explicitly permitted as exceptions to the "no hardcoded hex" rule:

1. **`"#fff"` on solid accent or dark surfaces** — white text/icons on a solid metric-color background (e.g. a teal chip header, a dark modal header). Use only when the token system would require computing contrast dynamically.
2. **`rgba(0,0,0,0.4)` modal overlay scrim** — the standard semi-transparent backdrop behind bottom sheets and modals. This is the only `rgba(0,0,0,…)` value permitted; all shadow colors must still use the warm formula.
3. **`allowFontScaling={false}` / `maxFontSizeMultiplier`** — dense text layouts (chip labels, bar axis labels, badge text) may cap font scaling to prevent overflow; use `maxFontSizeMultiplier={1.3}` or `allowFontScaling={false}` only when the layout genuinely cannot accommodate larger text.

---

## 3. Typography

### Font delivery

The app patches `Text.render` globally at startup (`src/theme/globalFont.ts`). **No screen needs to set `fontFamily` manually** — the user's chosen family (default: Nunito) is injected automatically. If a `Text` node sets its own `fontFamily`, the patch leaves it untouched.

For Nunito, `fontWeight` is resolved to a separate weight file (the patch replaces `fontWeight` with `fontFamily: "Nunito_700Bold"`, etc.) to avoid Android synthetic-bold artifacts. Never use a numeric `fontWeight` without a matching `fontFamily` on non-patched text nodes.

### Weight map (Nunito)

| Weight value | Resolved file |
|---|---|
| `"400"` / `normal` | `Nunito_400Regular` |
| `"500"` | `Nunito_500Medium` |
| `"600"` | `Nunito_600SemiBold` |
| `"700"` / `bold` | `Nunito_700Bold` |
| `"800"` / `"900"` | `Nunito_800ExtraBold` |

### Type scale (from `src/theme/tokens.ts`)

| Token | px | Typical role | Weight |
|---|---|---|---|
| `display` | 28 | Hero numeral / big stat | 800 |
| `title` | 22 | Screen title | 800 |
| `heading` | 18 | Card title, section header | 700–800 |
| `subheading` | 16 | Sub-section label | 600–700 |
| `body` | 14 | Log entries, descriptions | 400–600 |
| `label` | 12 | Chip text, form labels | 500–600 |
| `caption` | 11 | Timestamps, secondary metadata | 400–500 |
| `micro` | 9 | Uppercase badges, bar axis labels | 800, `letterSpacing: 0.6` |

Use `useFontSizes()` (from `src/theme/fontSystem.ts`) to read scaled values — they multiply with the user's font-size preset and compound with OS accessibility scaling.

**Primary ramp (2026-08 revamp).** New/revamped screens use only four steps plus the caps micro-label: `title` (22, screen title), `subheading` (16, card title), `body` (14), `caption` (11), and `micro` only via the `SectionLabel` component. `display`, `heading`, and `label` remain valid in legacy code but should not be introduced in new work; pick the nearest primary step. Never hardcode a font size.

**Card language.** One card style: `ShadowCard` with its default border (theme ink / user outline color). Per-card colored borders are banned; the single sanctioned accent is `ShadowCard`'s `accent` prop (left edge gradient strip).

**No-junk-data rule.** Sections with empty/zero data never render full-size tiles showing "0 …" or "--" — use `GhostRow` (slim dashed placeholder with optional CTA) or `EmptyState` for whole-section emptiness.

---

## 4. Card & Surface Anatomy

### Border radius (from `src/theme/tokens.ts` `RADIUS`)

| Element | Radius |
|---|---|
| Container card | 22–26 (`RADIUS.xl` = 22) |
| Stat chip / metric tile | 20–22 |
| Input field / text area | 16 (`RADIUS.lg`) |
| Action button | 16–22 |
| Icon badge / small tile | 8–12 (`RADIUS.sm`/`md`) |
| Pill / filter chip | 100 (`RADIUS.pill`) |
| Standard card | 18 (`RADIUS.card`) |

### Shadow spec

`shadowColor` must always be `"rgba(60,40,20,0.1)"`.

| Context | `shadowOffset` | `shadowOpacity` | `shadowRadius` | `elevation` |
|---|---|---|---|---|
| Container card | `{0, 10}` | 0.12 | 14 | 4 |
| Stat chip | `{0, 8}` | 0.10 | 12 | 3 |
| Button / small | `{0, 6}` | 0.08 | 10 | 2 |
| Tiny / badge | `{0, 4}` | 0.07 | 8 | 1 |

Use `coloredShadow()` or `layeredShadow()` from `src/theme/styleUtils.ts` where available.

### Border spec

- Container card: `borderWidth: 2`, `borderColor: theme.cardBorder`
- Stat chip: `borderWidth: 2.5`, `borderColor: c.solid`
- Input: `borderWidth: 2`, `borderColor: theme.cardBorder` (focused: `c.solid`)
- Buttons (outlined): `borderWidth: 2`, `borderColor: theme.ink`

### Padding norms

- Container card: `padding: 14–16`
- Stat chip: `padding: 10`
- Hero banner: `padding: 16`

---

## 5. Layout & Spacing

### Screen template

```
<ScreenBackground>
  <ScrollView
    contentContainerStyle={styles.content}
    refreshControl={<RefreshControl ... tintColor={theme.teal.bar} colors={[theme.teal.bar]} />}
  >
    {/* 1. Screen title (textStrong, title size, weight 800) */}
    {/* 2. Hero banner (LinearGradient card, one per screen) */}
    {/* 3. Metric chip grid (2×3 — 6 tiles, 3 columns × 2 rows, accent tint bg + solid border, all tile icons size 44)
            Interaction convention for loggable tiles (e.g. Water):
              press  → quick action (log one unit, optimistic + haptic)
              long-press → open detail screen
            Non-loggable tiles (e.g. MIND/Sleep/Glucose): press navigates to detail screen. */}
    {/* 4. Container cards (section content) */}
    {/* 5. Any recap/totals row (pastel score tiles) */}
  </ScrollView>
</ScreenBackground>
```

### Spacing rhythm (`src/theme/tokens.ts` `SPACING`)

| Token | px |
|---|---|
| `xs` | 4 |
| `sm` | 8 |
| `md` | 12 |
| `base` | 14 |
| `lg` | 16 |
| `xl` | 24 |
| `xxl` | 32 |

Use `gap` in flexbox layouts rather than manual `margin` between sibling cards. Prefer the token values; do not introduce arbitrary spacing.

### Scroll padding

| Screen type | `paddingBottom` on `contentContainerStyle` |
|---|---|
| Standard tab screen | 32 minimum |
| Screen with FAB | **96** |
| Screen with FeatureTour | Add `tourPadding` state + `onExtraPadding` prop |

### Horizontal padding

`padding: 16` on the `contentContainerStyle` for the main scroll view. Cards go edge-to-edge within that padding.

---

## 6. Component Patterns

### Required states for every data screen

Every screen that loads remote data must implement all four states:

1. **Loading** — render `<LoadingIndicator />` (or `<Skeleton.Card />`) while `loading === true`
2. **Empty** — use `<EmptyStateScreenTemplate>` for full-screen empty, or `<InlineEmptyState>` inside a card; never show a blank card
3. **Error with retry** — show a visible error banner with a "Retry" `Pressable`; use `theme.danger` for text color; call the load function on press (see MealsScreen `loadMeals` pattern)
4. **Pull-to-refresh** — `<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.teal.bar} colors={[theme.teal.bar]} />`

### Button feedback

- Disabled state: `opacity: 0.45`, not interactive
- Pressed state: use `Pressable` with `({ pressed }) => [style, pressed && { opacity: 0.75 }]` or `RipplePressable` for surfaces that support ripple
- Haptics: `expo-haptics` `impactAsync(Light)` on standard taps; `notificationAsync(Success)` on goal completions

### KeyboardAvoidingView on form screens

Copy the FinanceScreen pattern for all modals and screens with text inputs:

```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === "ios" ? "padding" : "height"}
  style={{ flex: 1 }}
>
  <ScrollView
    contentContainerStyle={s.modalContent}
    keyboardShouldPersistTaps="handled"
  >
    {/* form fields */}
  </ScrollView>
</KeyboardAvoidingView>
```

### Tab switchers (within a screen)

- Active tab: solid accent background (`c.solid`), white text
- Inactive tab: transparent background, `textSoft` color
- Container: `borderRadius: 22`, `borderWidth: 2`, `overflow: "hidden"` (clipping handles the active indicator)
- Keep all tab panels mounted; toggle visibility with `display: tab === active ? "flex" : "none"` to preserve scroll position and avoid re-fetching

### Screen templates

Located at `templates/` — copy and rename; do not build from scratch:

- `AuthScreen.template.tsx` — Login, SignUp, Onboarding
- `DashboardScreen.template.tsx` — Home/Overview
- `DomainScreen.template.tsx` — Health, Life, Meals, Finance, MedCycle tabs
- `DetailScreen.template.tsx` — drill-down screens
- `ListScreen.template.tsx` — searchable lists
- `SettingsListScreen.template.tsx` / `SettingsDetailScreen.template.tsx`
- `WizardScreen.template.tsx` — multi-step flows
- `AnalyticsScreen.template.tsx` — charts/insights
- `ModalSheet.template.tsx` — bottom sheets
- `EmptyStateScreen.template.tsx`
- `ConditionalFeatureScreen.template.tsx` — feature-flagged content

---

## 7. Copy & Language Rules

- **No emojis** in new screen copy unless explicitly requested. Existing emoji icon-maps (e.g. MedicationHistoryScreen `EMOJI_MAP`) are grandfathered; when adding to them use single-codepoint emoji only (avoid ZWJ sequences or variation selectors that may render inconsistently on Android).
- **Never hardcode emoji as icons in screens or components.** Any icon-like emoji (metric indicators, state icons, category badges) must render via `<ThemedIcon slot="..." />` using a slot from `src/theme/iconRegistry.tsx`. If no slot fits, add one — do not inline the emoji. This ensures `theme.iconOverrides` applies everywhere. Exempt: inline sentence/copy emoji (e.g. "Nice work 🎉") and user-generated content.
- **Metric icons in badges**: `ThemedIcon` / `iconRegistry` slots are the preferred pattern; fall back to Ionicons for purely functional UI (chevrons, gear, close).
- **Capitalization**: sentence case for body text and labels; title case for screen headings and tab labels only.
- **Tone**: descriptive, never diagnostic. Single-day observations use gentle language ("glucose climbed after lunch today"). Repeated patterns must cite the count ("4 of the last 5 days"). Never phrase a pattern as medical advice or a causal claim.
- **Light/dark branching**: never branch on `theme.isDark` inside a screen component. All color differences are expressed through theme tokens.

---

## 8. Accessibility

- Every icon-only button must have `accessibilityLabel` and `accessibilityRole="button"`. Example from FinanceScreen: `accessibilityLabel="Customize Finance screen"`.
- Minimum touch target: 44×44 pt. Use `hitSlop={14}` on small icons rather than making the visual element larger.
- Reduce motion: import `useReduceMotion` from `src/hooks/useReduceMotion` and skip or shorten animations when true. Button, RipplePressable, Skeleton, and NumberRoll already respect this.
- Dynamic Type: use `useFontSizes()` tokens; do not hard-code `fontSize` as a constant.
- Settings permission status (notifications, Health Connect) must be re-checked on screen focus via `useFocusEffect`, not just on mount — the user may have changed permissions in the OS settings screen and returned.
- `accessibilityViewIsModal={true}` on all modal `View` roots to trap VoiceOver focus.

---

## 9. New Screen Checklist

Run through this before calling a screen done:

- [ ] Uses `useTheme()` for all colors; no hardcoded hex (exception: `#9B59B6` for legacy med/cycle only)
- [ ] `ScreenBackground` wraps the root view
- [ ] `ScrollView` has `RefreshControl` with `tintColor={theme.teal.bar}`
- [ ] `contentContainerStyle` has `paddingBottom: 96` (FAB screen) or `32` (no FAB)
- [ ] Loading state renders `<LoadingIndicator />` or skeleton
- [ ] Empty state uses `<EmptyStateScreenTemplate>` or `<InlineEmptyState>` — no blank cards
- [ ] Error state shows a banner with `theme.danger` text and a retry button
- [ ] All form modals wrap content in `<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>` + `keyboardShouldPersistTaps="handled"`
- [ ] All icon-only buttons have `accessibilityLabel` and `accessibilityRole="button"`
- [ ] Touch targets are at least 44×44 pt (use `hitSlop={14}` for small icons)
- [ ] Card shadows use `rgba(60,40,20,0.1)` — not `"#000"`
- [ ] Container card borders use `theme.cardBorder`; stat chip borders use `c.solid`
- [ ] Border radii match the spec (cards 22+, chips 20+, inputs 16, pills 100)
- [ ] No `fontFamily` set manually on `Text` nodes unless intentionally overriding the global patch
- [ ] No emojis in new copy unless explicitly requested; no branching on `theme.isDark`

---

## 10. Shared Primitives — Mandatory Usage

| Primitive | File | When to use |
|---|---|---|
| `ShadowCard` | `src/components/ShadowCard.tsx` | Every data card; default border; only accent via `accent` prop |
| `SectionLabel` | `src/components/SectionLabel.tsx` | All caps micro-labels between sections; replaces inline `<Text>` with `fontSize: 9` and `textTransform: uppercase` |
| `GhostRow` | `src/components/GhostRow.tsx` | Empty / zero-value placeholders; replaces junk rows such as "0 exercises · 0m" |
| `EmptyState` | `src/components/EmptyState.tsx` | Full-section empty state with illustration |

**Do not build raw `<Text>` section labels** — always use `<SectionLabel text="..." />`.

**Do not render zero-value data rows** — use `<GhostRow>` instead (e.g., sessions with `entry_count === 0`).

### InsightCard compact mode

`InsightCard` has a `compact` prop (default `false`). When `compact=true` and the card is collapsed it renders a single-line row: small icon + title + confidence dot (color from theme token) + one-line summary (`numberOfLines={1}`) + chevron. Tapping expands the card in place to show full detail (description, supporting data, feedback, actions). The expanded state renders the same full-card layout plus a "Collapse" button. Memoization via `React.memo` is preserved in both modes. **InsightsScreen uses `compact` mode exclusively**, grouping insights by category under `SectionLabel` headers.

### ToastHost positioning

`ToastHost` renders at root level, outside the tab navigator. Its `bottom` offset is calculated as:

```
TAB_BAR_HEIGHT (56) + insets.bottom + 12
```

where `insets.bottom` comes from `useSafeAreaInsets()`. This ensures toasts clear the bottom nav bar on all device sizes including those with a home indicator.

---

## Appendix: Where Things Live

| What | Path |
|---|---|
| Palette definitions | `src/theme/palettes.ts` |
| Theme type | `src/theme/theme.ts` |
| Design tokens (sizes, spacing, radius) | `src/theme/tokens.ts` |
| Font system + `useFontSizes()` | `src/theme/fontSystem.ts` |
| Global font patch | `src/theme/globalFont.ts` |
| Shadow / style utils | `src/theme/styleUtils.ts` |
| Motion constants | `src/theme/motion.ts` |
| Page/card templates | `src/theme/pageTemplates.tsx` |
| Icon registry | `src/theme/iconRegistry.tsx` |
| Theme context / `useTheme()` | `src/theme/ThemeContext.tsx` |
| App settings context | `src/theme/AppSettingsContext.tsx` |
| Screen templates | `templates/` |
| Metric color helper | `src/lib/metricColors.ts` |
