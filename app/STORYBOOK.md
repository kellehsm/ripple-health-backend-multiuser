# Component Library — Storybook Guide

This project doesn't run Storybook yet, but the component library is designed so it can be scaffolded painlessly whenever we decide to add it.

## The library

All reusable components live under `app/src/components/`. The ones worth cataloguing first:

### Foundations
- `<ScaledText>` — density- and font-scale-aware Text
- `<Button>` — primary / secondary / ghost / danger / iconOnly, sizes sm/md/lg
- `<RipplePressable>` — brand-consistent tappable surface with haptics + ripple
- `<IconVariant>` — semantic icon wrapper (line/filled/duotone-ready)

### Loading & empty
- `<Skeleton>` / `<SkeletonCard>` / `<SkeletonRow>` / `<SkeletonChart>`
- `<EmptyState>` + presets in `EMPTY_STATES`
- `<EmptyChart>` — placeholder for metrics with no data yet
- `<ProgressiveList>` — loading / empty / error triad in one wrapper

### Robustness
- `<ScreenErrorBoundary>` — wraps every screen
- `<RetryPlaceholder>` — inline card-level retry
- `<OfflineBanner>` + `<LastSyncedChip>`

### Data viz
- `<Sparkline>` — trailing-N-day trend line
- `<NumberRoll>` — count-up animation
- `<InsightSparkline>` — two-bar comparison for insight cards

### Delight / behavior
- `<WhatsNewModal>` — first-launch changelog
- `<DebugDrawer>` — dev-only feature flags + actions
- `<FeatureTour>`, `<TooltipBubble>`, `<MilestoneBanner>` (existing)

## To add Storybook later

```bash
cd app
npm i -D @storybook/react-native@next @storybook/addon-ondevice-controls @storybook/addon-ondevice-actions
npx sb init --type react_native
```

Then move component preview files into `app/src/components/*.stories.tsx` matching the existing `<ComponentName>` files.

## Style rules for library authors

1. **Every user-facing text uses `<ScaledText>`**, not raw `<Text>`.
2. **Every tappable surface** wraps in `<RipplePressable>` or `<Button>`.
3. **Every animation** respects `useReducedMotion()`.
4. **Every haptic** goes through `haptics.tap/pop/press/success/warning/error/streakBroken/celebrate`.
5. **Every empty state** uses `<EmptyState>` with a preset from `EMPTY_STATES` where possible.
6. **Every skeleton** uses the `Skeleton` primitives.
7. **Every color** comes from theme tokens or `useMetricColor(key)`. No raw hex.
8. **Every number** goes through `formatNumber` / `formatCurrency` / `formatWithUnit`.
9. **Every date** goes through `formatShortDate` / `formatRelativeTime` / `formatTime`.
10. **Every gap / padding** uses `SPACING` tokens.

## Design tokens

- `app/src/theme/tokens.ts` — SPACING, FONT_SIZES, RADIUS
- `app/src/theme/motion.ts` — MOTION, SPRING_*, ANIM presets, PRESS_SCALE
- `app/src/theme/elevation.ts` — ELEVATION[0..4]
- `app/src/theme/palettes.ts` — color palettes (10+ themes)
- `app/src/lib/haptics.ts` — the whole haptic vocabulary
