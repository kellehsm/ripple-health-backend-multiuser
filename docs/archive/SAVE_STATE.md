# Save State — Ripple Wellness Multiuser Dev
Last updated: 2026-07-25

---

## Where things are

| | |
|---|---|
| Dev directory | `/root/wellness-fresh-multiuser-dev` (branch: `dev`) |
| Prod directory | `/root/wellness-fresh-multiuser` (branch: `master`) |
| Backend | port 4001 (multiuser), proxied via Caddy at `app.kels.gg` |
| Dev backend | port 4002 |
| Test via | Expo Go scanning QR from `npx expo start --port 8082` |

**Dev is ahead of prod.** The commits from this session (`02007fe` → `62920e9`) have NOT been merged to master yet. Ask before pushing to prod.

---

## What was built this session

### Theme template system — complete

The full per-page theme template system was built from scratch. Everything below is new.

**New files:**

| File | What it does |
|---|---|
| `src/theme/pageTemplates.tsx` | Defines every card/tile/page slot across all 13 screens. Contains `ThemedSurface` component and `usePageBackground` / `useCardBackground` / `useTileBackground` hooks. |
| `src/theme/iconRegistry.tsx` | All icon slots routed through a registry. `ThemedIcon` component renders emoji / ionicon / image / uri. `moodScoreEmoji()` and `greetingEmoji()` helpers. |
| `src/theme/fontSystem.ts` | System / Serif / Monospace font families. 4-step scale (compact → xlarge). `useFontSizes()` and `useFontFamily()` hooks. |

**Modified files:**

| File | What changed |
|---|---|
| `src/theme/theme.ts` | Added `iconOverrides`, `fontFamily`, `pageBackgrounds`, `cardBackgrounds`, `tileBackgrounds` to Theme type |
| `src/theme/AppSettingsContext.tsx` | Added `fontFamily` + `fontSizeScale` settings (AsyncStorage). Added `useCardShadow()` and `useCardOpacity()` hooks. |
| `src/theme/backgrounds/index.tsx` | `ThemedBackground` now accepts `pageId`, checks `theme.pageBackgrounds[pageId]` for an image override before falling back to the SVG scene |
| `src/components/ScreenBackground.tsx` | Added optional `pageId` prop, passes it through to `ThemedBackground` |
| `src/types/tabPreferences.ts` | Replaced `emoji: string` with `iconSlot: string` on `ModuleDefinition` |
| `src/components/BottomNav.tsx` | All tab icons now render via `ThemedIcon` instead of inline emoji Text |
| `src/screens/OverviewScreen.tsx` | Greeting icons via `ThemedIcon`, mood scores via `moodScoreEmoji()` |
| `src/screens/HealthScreen.tsx` | Mindfulness card + water tile + glucose box wired to `useCardShadow` / `useCardOpacity` |
| `src/screens/TabPreferencesScreen.tsx` | Updated to use `mod.iconSlot` + `ThemedIcon` |
| `src/screens/settings/AppearanceSettingsScreen.tsx` | Added font family selector (radio list) and font size scale selector (pill row) |
| `src/strings/defaults.ts` | Four new string keys for font family/scale appearance sections |

**Theme picker:**

| File | What changed |
|---|---|
| `src/screens/ThemePickerModal.tsx` | Added ✦ PREMIUM section at bottom with dashed-border "coming soon" placeholder card |

**Templates folder** (`/root/wellness-fresh-multiuser-dev/templates/`):

Reference copies of all theme-authoring files + a complete how-to guide.
- `theme.ts`, `palettes.ts`, `tokens.ts`, `backgrounds.tsx`, `pageTemplates.tsx`, `iconRegistry.tsx`, `fontSystem.ts`, `ScreenBackground.tsx`
- `CUSTOM_THEME_GUIDE.md` — step-by-step guide to building a complete custom/premium theme

---

## What the theme system can do now

A premium theme palette can set any combination of:

```ts
const myTheme: Theme = {
  // colors...
  pageBackgrounds:  { "overview": { type: "image", value: require("...") } },
  cardBackgrounds:  { "sleep_card": { type: "image", value: require("...") } },
  tileBackgrounds:  { "overview_steps": { type: "image", value: require("...") } },
  iconOverrides:    { "tab.wellness": { type: "emoji", value: "🌺" } },
  fontFamily:       "Serif",
  strings:          { home_greeting_morning: "Rise and shine" },
};
```

---

## What's NOT done yet

These were discussed or implied but not implemented:

- **No actual premium themes exist** — the Premium section in the picker is a placeholder. The infrastructure is fully built, just needs palettes.
- **`ThemedSurface` not wired into screen components** — `pageTemplates.tsx` exports `ThemedSurface` but individual screens still use plain `View` for cards/tiles. For image backgrounds to render on cards/tiles, screens need to swap `View` → `ThemedSurface`. None have been updated yet.
- **`ScreenBackground` still called without `pageId`** — most screens call `<ScreenBackground />` with no `pageId`, so page image overrides won't trigger. Search for `<ScreenBackground` and add the appropriate `pageId` prop to each.
- **`useCardOpacity` / `useCardShadow` only wired to HealthScreen** — other screens still have inline shadow styles and no opacity control. FinanceScreen has `layeredShadow` applied but not the hook version.

---

## Prod status

Master is at commit `5238667` (the polish pass from earlier in the session).
Dev has 7 unpushed-to-prod commits on top of that:

```
62920e9  Rewrite CUSTOM_THEME_GUIDE
9b3679e  Add CUSTOM_THEME_GUIDE
34523bd  Wire background image support (pages/cards/tiles)
7e4b101  Add backgrounds.tsx to templates
719bb50  Add templates/ folder
7356ac7  Add Premium section to theme picker
02007fe  Theme template system (main commit)
```

None of these touch native code — all JS-only changes, safe to merge to master
and test via Expo Go on the existing APK at any time.

---

## To continue

**To test in Expo Go:**
```bash
cd /root/wellness-fresh-multiuser-dev
npx expo start --port 8082
```

**To push to prod:**
```bash
# from /root/wellness-fresh-multiuser
git fetch origin && git merge origin/dev && git push origin master
```

**Highest priority next steps:**
1. Wire `<ScreenBackground pageId="overview" />` (etc.) in each screen — 10 min, find/replace
2. Wire `ThemedSurface` into the 2–3 most important cards (sleep, mindfulness, overview tiles) — 30 min
3. Build the first actual premium theme palette — uses `templates/CUSTOM_THEME_GUIDE.md`
