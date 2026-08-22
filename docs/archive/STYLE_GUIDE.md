# Ripple — Bright Companion Style Guide
> Reference this file when restyling existing screens or creating new ones.

---

## 1. Color System

All colors are defined in `src/theme/palettes.ts`. The active light theme is **morning-mist**. Changes to other themes should mirror the same hue relationships.

### Surface tokens (morning-mist)
| Token | Value | Role |
|---|---|---|
| `page` | `#F5ECDF` | Screen background (warm cream) |
| `cream` | `#FAF5EE` | Lightest background, used for subtle insets |
| `card` | `#FEFCF8` | Card / sheet surface |
| `cardBorder` | `#C4B5A5` | **Neutral** border on container cards only |
| `ink` | `#1C2B3A` | Dark ink for text, button borders, icon strokes |
| `textStrong` | `#1C2B3A` | Headings, primary values, body text |
| `textSoft` | `#5C6D7E` | Labels, captions, placeholders |

### Accent color families
Each family has `solid` (saturated, for borders/badges/buttons), `bg`/`tint` (pastel, for chip backgrounds), `fg` (always `#1C2B3A` black on pastel), and `sub` (darker shade for secondary text).

| Family | Role | Solid | Pastel bg |
|---|---|---|---|
| `teal` | Steps, activity, hobbies, books | `#1A9870` (green, hue 165) | `#D8F5EB` |
| `coral` | Food / meals | `#C85C28` (orange, hue 38) | `#FBEACC` |
| `blue` | Water | `#2870C8` (blue, hue 228) | `#DAE8FA` |
| `amber` | Sleep | `#B88820` (amber, hue 82) | `#F8EEC8` |
| `purple` | Finance / spending | `#7830B8` (purple, hue 302) | `#ECD8FA` |
| `berry` | Glucose, heart rate | `#C02840` (red, hue 356) | `#FAE0E4` |
| `violet` | Mood | `#7838B8` (violet, hue 296) | `#ECD8FA` |

### Dark theme equivalents
Dark themes must use **brighter** saturated accents (raise L by ~10%) and **near-white** text. Container card borders should be clearly visible — use the accent `solid` or a light warm neutral (≥ 40% lightness). Never use the same dark `cardBorder` value as light mode on a dark background.

---

## 2. Typography

The app uses the system default font. Font weights and sizes follow this hierarchy:

| Role | Size | Weight | Notes |
|---|---|---|---|
| Screen title | 20–22px | 800–900 | First heading at top of each screen |
| Card title | 17–19px | 800 | Section heading inside a card |
| Value text | 18–22px | 800–900 | Metric numbers (steps, calories, etc.) |
| Caption / label | 9–10px | 800 | Uppercase, `letterSpacing: 0.6–0.7` |
| Body text | 13–14px | 400–600 | Log entries, descriptions |

---

## 3. Card Patterns

### 3a. Container card (section wrapper)
Wraps a section of content (meal log, metric group, activity list).

```ts
{
  borderRadius: 22,        // was 12 in old style — now 22+ for all cards
  borderWidth: 2,
  borderColor: border,     // theme.cardBorder — NEUTRAL warm, NOT ink
  backgroundColor: card,   // theme.card
  padding: 14,
  shadowColor: "rgba(60,40,20,0.08)",
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.12,
  shadowRadius: 14,
  elevation: 4,
}
```

**Rule**: always pass `theme.cardBorder` as the container card border — never `ink` or an accent color.

### 3b. Stat chip (metric tile)
Individual metric: steps count, water glasses, sleep hours, etc. Used in 2×2 grids.

```ts
// tile background = theme accent .tint (pastel)
// tile border     = theme accent .solid (saturated) — this is the key visual rule
{
  borderRadius: 22,
  borderWidth: 2.5,
  borderColor: c.solid,           // saturated accent — makes chips pop
  backgroundColor: c.tint,
  padding: 10,
  shadowColor: "rgba(60,40,20,0.1)",
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 2,
}
```

Text inside a stat chip: always `theme.textStrong` (`#1C2B3A`) — **never white on pastel**.

### 3c. Hero banner (one per screen)
The single saturated-gradient area per screen. Used for streaks, goals, daily status.

```ts
{
  borderRadius: 20,
  padding: 16,
  // gradient from accent.solid → darker variant (or use LinearGradient)
  backgroundColor: c.solid,   // fallback if no gradient
  // white text + large emoji
}
```

Text on hero banner: **white** (`#ffffff`). No border needed (the saturated bg provides definition).

### 3d. Pastel score tile (overview / 7-day recap)
Small colored tiles in a row/grid showing summaries.

```ts
{
  borderRadius: 16,
  borderWidth: 2,
  borderColor: c.solid,    // saturated for definition
  backgroundColor: c.tint, // pastel bg
  padding: 10,
}
// Text: theme.textStrong (black) — never white on pastel
// Optional: transform: [{ rotate: '-1deg' }] / rotate(1deg) for alternating tiles
```

---

## 4. Shadow System

**Old style** (replaced): `shadowOffset: {4,4}, shadowOpacity: 1, shadowRadius: 0` — hard black offset.

**New style** (Bright Companion): soft warm ambient shadow.

| Context | shadowOffset | shadowOpacity | shadowRadius | elevation |
|---|---|---|---|---|
| Container card | `{0, 10}` | 0.12 | 14 | 4 |
| Stat chip | `{0, 8}` | 0.10 | 12 | 3 |
| Button / small | `{0, 6}` | 0.08 | 10 | 2 |
| Tiny / badge | `{0, 4}` | 0.07 | 8 | 1 |

`shadowColor` should always be `"rgba(60,40,20,0.1)"` — warm-toned, not cool gray.

---

## 5. Border Radius Reference

| Element | New radius | Old radius |
|---|---|---|
| Container card | 22–26 | 12–14 |
| Stat chip / metric tile | 20–22 | 10–12 |
| Input field / text area | 16 | 10 |
| Action button | 16 | 10 |
| Icon badge / tile | 12 | 8 |
| Pill / filter chip | 20 | 20 (unchanged) |
| Small dot / avatar | 4 | 4 (unchanged) |

---

## 6. Border Color Rules (Golden Rule)

| Background | Border color to use |
|---|---|
| Light card/chip on cream bg | **Saturated accent** `c.solid` (for chips) or `theme.cardBorder` (for containers) |
| Dark card on dark bg (dark theme) | **Light** border — accent `c.solid` or white-adjacent (≥ 60% L) |
| Hero banner (saturated gradient) | None, or semi-transparent white |

**Never** use a pale/pastel color as a border on a light background — it will disappear.

---

## 7. Icons

Use **real emoji** for all content/metric icons inside colored badge backgrounds. Ionicons are acceptable for purely functional UI (search, chevrons, settings gear).

| Metric | Emoji |
|---|---|
| Steps | 👟 |
| Sleep | 🌙 |
| Water | 💧 |
| Heart rate | ❤️ |
| Meals / food | 🍕 🌯 🥣 |
| Caffeine | ☕ |
| Mood | 🙂 |
| Mindfulness | 🧘 |
| Streak | 🔥 |
| Calories | 🔥 |
| Active minutes | ⏱️ |
| Workouts | 🏋️ |
| Cardio | 🏃 |
| Hobbies (sessions) | 🎯 |
| Hobbies (hours) | ⏳ |
| Reading | 📚 |
| Guitar | 🎸 |
| Gardening | 🌱 |
| Finance / budget | 💰 |
| Groceries | 🛒 |

---

## 8. Screen Layout Template

Every screen should follow this structure:

1. **Screen title** (`textStrong`, 20–22px, weight 800) at the top
2. **Hero banner** — one saturated gradient card per screen with emoji + status line
3. **2×2 or 3×2 metric chip grid** — stat chips with pastel tint bg, saturated border
4. **Container cards** for primary content (log entries, lists, charts)
5. **Pastel score tiles** for any recap/totals row

---

## 9. Dark Theme Checklist

Before applying this system to a dark palette:

- [ ] `textStrong` is near-white (≥ 90% L) — not the same as light mode
- [ ] `textSoft` is light enough to read on dark card bg (≥ 55% L)
- [ ] `cardBorder` is **lighter** than the card surface — at least 15% L difference
- [ ] Each accent `.solid` is raised to ~65–72% L (brighter than light mode's 58–68%)
- [ ] Each accent `.tint`/`.bg` is a very dark tinted color (8–14% L), not the same pastel
- [ ] Hero banner white text has sufficient contrast against the gradient
- [ ] No white-on-pastel situations (pastel tints are dark in dark mode, so text should be light)

---

## 10. Where Things Live

| What | File |
|---|---|
| All palette definitions | `src/theme/palettes.ts` |
| Theme type definition | `src/theme/theme.ts` |
| Theme context / hook | `src/theme/ThemeContext.tsx` |
| Shared MetricCard chip | `src/components/MetricCard.tsx` |
| Screens | `src/screens/*.tsx` |
| Bottom nav | `src/components/BottomNav.tsx` |
