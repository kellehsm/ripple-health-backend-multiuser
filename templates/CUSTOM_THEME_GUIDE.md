# Building a Custom Theme

There are two parts to every theme: the **required core** (colors + background scene)
and the **optional extras** (image overrides, icon swaps, font, text changes).
Start with the core — the app will work. Then layer in extras.

---

## Part 1 — The core (required)

### 1. Create the color palette

Open `src/theme/palettes.ts`.
Scroll to the bottom, just before the `export const PALETTES` line.
Copy the block below and fill in your values.

```ts
const myTheme: Theme = {

  // ── Who this theme is ───────────────────────────────────────────────────────
  id:      "my-theme",    // unique ID, no spaces, e.g. "rose-gold" or "deep-forest"
  name:    "My Theme",    // shown in the theme picker
  group:   "Premium",     // section header in the picker — use "Light Themes", "Dark Themes", or "Premium"
  isDark:  false,         // set true for dark themes

  // ── Screen background ───────────────────────────────────────────────────────
  page:        "#F5ECDF", // the main background color of every screen
  gradientEnd: "#EDE5D5", // where the background gradient fades to
  cream:       "#FAF5EE", // the very lightest background (chips, badges)

  // ── Cards & borders ─────────────────────────────────────────────────────────
  card:       "#FEFCF8",  // the background color of every card
  cardBorder: "#C4B5A5",  // card border and divider lines
  ink:        "#1C2B3A",  // all other borders, icon outlines

  // ── Text ────────────────────────────────────────────────────────────────────
  textStrong: "#1C2B3A",  // headings, numbers, primary labels
  textSoft:   "#5C6D7E",  // captions, hints, placeholder text

  // ── Action colors ───────────────────────────────────────────────────────────
  primary:     "#2870C8", // buttons, active switches, selected tabs
  success:     "#1A9870", // in-range values, positive states
  warning:     "#B88820", // caution / elevated values
  danger:      "#C02840", // alerts, errors
  glucoseHigh: "#C02840", // glucose high indicator (can match danger)
  glucoseLow:  "#2870C8", // glucose low indicator (can match primary)

  // ── The 8 color families ────────────────────────────────────────────────────
  // Each family is used for a specific category throughout the app.
  // For each one you need: solid, sub, bg, fg, tint
  // teal   → steps, activity, hobbies
  // coral  → food, meals
  // blue   → water
  // amber  → sleep
  // purple → finance, spending
  // berry  → glucose, heart rate
  // violet → mood
  // red    → danger states, alerts

  teal:   { solid: "#1A9870", sub: "#0E6848", bg: "#D8F5EB", fg: "#1C2B3A", tint: "#D8F5EB", bar: "#1A9870" },
  coral:  { solid: "#C85C28", sub: "#A04018", bg: "#FBEACC", fg: "#1C2B3A", tint: "#FBEACC" },
  blue:   { solid: "#2870C8", sub: "#1858A8", bg: "#DAE8FA", fg: "#1C2B3A", tint: "#DAE8FA" },
  amber:  { solid: "#B88820", sub: "#906808", bg: "#F8EEC8", fg: "#1C2B3A", tint: "#F8EEC8" },
  purple: { solid: "#7830B8", sub: "#581898", bg: "#ECD8FA", fg: "#1C2B3A", tint: "#ECD8FA" },
  berry:  { solid: "#C02840", sub: "#901828", bg: "#FAE0E4", fg: "#1C2B3A", tint: "#FAE0E4", bar: "#C02840" },
  violet: { solid: "#7838B8", sub: "#581898", bg: "#ECD8FA", fg: "#1C2B3A", tint: "#ECD8FA" },
  red:    { solid: "#C02840", sub: "#901828", bg: "#FAE0E4", fg: "#1C2B3A", tint: "#FAE0E4" },

  // ── Keep these in sync with the families above ──────────────────────────────
  pink:  { solid: "#C02840", sub: "#901828", bg: "#FAE0E4", fg: "#1C2B3A", tint: "#FAE0E4" },
  green: { solid: "#1A9870", sub: "#0E6848", bg: "#D8F5EB", fg: "#1C2B3A", tint: "#D8F5EB" },
  brown: { solid: "#8B5E3C", sub: "#6A4018", tint: "#F5EDE0" },

  // ── Cycle tracker ───────────────────────────────────────────────────────────
  cycle: {
    period:    "#C02840",
    predicted: "#FAB8C0",
    mood:      "#7838B8",
    symptom:   "#1A9870",
    fertile:   "#2870C8",
    ovulation: "#B88820",
  },

  // ── Finance category colors ──────────────────────────────────────────────────
  finance: {
    food:          "#C85C28",
    transport:     "#2870C8",
    shopping:      "#7830B8",
    health:        "#1A9870",
    entertainment: "#C02840",
    utilities:     "#B88820",
    other:         "#5C6D7E",
  },
};
```

**What the color family fields mean:**

- `solid` — the main color. Used for bar fills, active states, bold accents.
- `sub` — a darker shade. Used for text sitting on a light `tint` background.
- `bg` / `tint` — very light wash. Used for card and tile backgrounds. (`tint` is usually the same as or slightly lighter than `bg`.)
- `fg` — text color when sitting on `bg`. Usually your `textStrong`.
- `bar` — progress bar fill. Only `teal` and `berry` need this — others use `solid`.

---

### 2. Register it so it appears in the picker

Still in `src/theme/palettes.ts`, find the two exports at the very bottom and add your theme:

```ts
export const PALETTES: Record<string, Theme> = {
  "morning-mist": morningMist,
  // ... other existing themes ...
  "my-theme": myTheme,        // ← add this line
};

export const PALETTE_GROUPS: Record<string, string[]> = {
  "Light Themes": ["morning-mist", "pale-sage", "blush-hour", "jewel-light", "clean-slate"],
  "Dark Themes":  ["obsidian", "arctic", "volcanic", "abyssal", "nebula"],
  "Premium":      ["my-theme"],   // ← add your ID here (creates a new section in picker)
};
```

---

### 3. Add the description shown under the theme name

Open `src/screens/ThemePickerModal.tsx`.
Find the `BEST_FOR` object near the top and add one line:

```ts
const BEST_FOR: Record<string, string> = {
  "morning-mist": "Warm cream & soft greens — the classic default",
  // ... existing entries ...
  "my-theme": "One sentence describing the vibe of your theme",
};
```

---

### 4. Draw the background scene (the decorative illustration behind screens)

Open `src/theme/backgrounds/index.tsx`.

Every theme has one full-screen SVG rendered at very low opacity (0.05–0.12)
behind all screen content. It's purely decorative — keep it subtle.

Add a new function anywhere before the `BACKGROUND_REGISTRY` block:

```tsx
function MyThemeBg({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>

      {/* Put your SVG shapes here. Examples: */}

      {/* A soft circle in the top-right corner */}
      <Circle
        cx={width * 0.85} cy={height * 0.15} r={160}
        fill="#FF6B6B" opacity={0.07}
      />

      {/* A smaller accent circle bottom-left */}
      <Circle
        cx={width * 0.15} cy={height * 0.78} r={100}
        fill="#4ECDC4" opacity={0.06}
      />

    </Svg>
  );
}
```

Then register it in the `BACKGROUND_REGISTRY` object just below:

```ts
const BACKGROUND_REGISTRY: Record<string, BgComponent> = {
  "morning-mist": MorningMistBg,
  // ... existing entries ...
  "my-theme": MyThemeBg,    // ← add this
};
```

> **Tip:** If you're using a background image instead (Part 2 below),
> you can skip this step entirely — just don't add an entry and the SVG layer
> will be empty, letting your image show through.

---

That's it for the core. Your theme will now appear in the picker and work throughout the app.

---

## Part 2 — The extras (optional, premium features)

These are all added as extra fields inside your palette `const`. None are required.

---

### Background images on pages, cards, and tiles

You can replace the background of any individual page, card, or tile with a photo.

```ts
const myTheme: Theme = {
  // ... all the color fields ...

  pageBackgrounds: {
    // Key = page ID. Replaces the full-screen background on that page.
    "overview":    { type: "image", value: require("../../assets/themes/my-theme/overview_bg.png") },
    "meals":       { type: "image", value: require("../../assets/themes/my-theme/meals_bg.png") },
    "mindfulness": { type: "uri",   value: "https://cdn.example.com/mindful_bg.jpg" },
  },

  cardBackgrounds: {
    // Key = card ID. Replaces the background of that specific card.
    "mindfulness_banner": { type: "image", value: require("../../assets/themes/my-theme/mindful_card.png") },
    "sleep_card":         { type: "image", value: require("../../assets/themes/my-theme/sleep_card.png") },
  },

  tileBackgrounds: {
    // Key = tile ID. Replaces the background of that specific tile.
    "overview_steps": { type: "image", value: require("../../assets/themes/my-theme/steps_tile.png") },
  },
};
```

Put your image files in `assets/themes/my-theme/` to keep things organised.

Use `type: "image"` for local files bundled with the app.
Use `type: "uri"` for remote URLs loaded at runtime.

**Page IDs:**
`overview` `wellness` `meals` `life` `finance` `health_tab` `mindfulness` `friends` `exercise` `insights` `settings` `steps_detail` `heart_detail`

**Card IDs by screen:**

| Screen | Card IDs |
|---|---|
| overview | `wellness_snapshot` `streak_pills` `fasting_timer` `timeline` `insights_preview` `mood_pattern` `cross_metric` `seven_day_review` |
| wellness | `mindfulness_banner` `sleep_card` `glucose_card` `heart_rate_card` `water_card` `steps_card` |
| meals | `meal_log` `food_report` `glucose_panel` |
| life | `hobbies_card` `books_card` `substances_card` `mood_log_card` |
| finance | `spending_total` `spending_breakdown` `transaction_list` `mood_suggest` |
| health_tab | `med_schedule` `med_list` `cycle_calendar` `symptom_log` |
| mindfulness | `breathing_card` `gratitude_card` `grounding_card` `mindfulness_log` |
| friends | `leaderboard_card` `challenges_card` `activity_feed` |
| exercise | `workout_card` `history_card` `plan_card` |
| insights | `insight_list` |
| settings | `profile_card` `account_card` `appearance_card` `tracking_card` `notif_card` `data_card` |
| steps_detail | `week_comparison` `day_by_day` `daily_averages` `month_over_month` |
| heart_detail | `heart_rate_card` `seven_day_hist` |

**Tile IDs:**

| Screen | Tile IDs |
|---|---|
| overview | `overview_steps` `overview_mood` `overview_water` `overview_glucose` `overview_sleep` |
| wellness | `wellness_steps` `wellness_sleep` `wellness_water` `wellness_heart` |
| meals | `meal_breakfast` `meal_lunch` `meal_dinner` `meal_snack` |
| insights | `filter_all` `filter_wellness` `filter_mindfulness` `filter_hobbies` `filter_medication` `filter_exercise` `filter_finance` `filter_cycle` `filter_combined` |

---

### Custom icons

Swap any icon in the app for this theme. Find the slot IDs you want to change:

```ts
const myTheme: Theme = {
  // ...
  iconOverrides: {
    "tab.wellness":  { type: "emoji",   value: "🌺" },
    "tab.meals":     { type: "emoji",   value: "🍱" },
    "metric.steps":  { type: "ionicon", name: "footsteps" },
    "tab.finance":   { type: "image",   source: require("../../assets/icons/finance.png") },
  },
};
```

**All slot IDs:**

*Tabs:* `tab.wellness` `tab.meals` `tab.health_both` `tab.health_meds` `tab.health_cycle` `tab.exercise` `tab.hobbies` `tab.finance` `tab.home`

*Metrics:* `metric.steps` `metric.sleep` `metric.water` `metric.heart` `metric.glucose` `metric.mood` `metric.exercise`

*Greetings:* `greeting.morning` `greeting.afternoon` `greeting.evening`

*Mood scores:* `mood.1` `mood.2` `mood.3` `mood.4` `mood.5`

*Meal types:* `mealType.breakfast` `mealType.lunch` `mealType.dinner` `mealType.snack`

*Insight filters:* `insight.all` `insight.wellness` `insight.mindfulness` `insight.hobbies` `insight.medication` `insight.exercise` `insight.finance` `insight.cycle` `insight.combined`

---

### Custom font

```ts
const myTheme: Theme = {
  // ...
  fontFamily: "Serif",  // "System" (default) | "Serif" | "Monospace"
};
```

`Serif` renders as Georgia on iOS and Noto Serif on Android.
Users can still override this in their own Appearance settings.

---

### Custom text / labels

Rename any label, heading, or button in the app for this theme:

```ts
const myTheme: Theme = {
  // ...
  strings: {
    home_greeting_morning: "Good morning, beautiful",
    home_greeting_evening: "Time to unwind",
    meals_log_empty:       "Nothing eaten yet — add your first meal",
  },
};
```

Only include keys you want to change. Everything else uses the default text.

---

## Checklist before shipping

- [ ] Palette added to `palettes.ts` with a unique `id`
- [ ] Added to `PALETTES` and `PALETTE_GROUPS`
- [ ] Description added to `BEST_FOR` in `ThemePickerModal.tsx`
- [ ] Background scene added to `backgrounds/index.tsx` (or skipped if using images)
- [ ] Image assets placed in `assets/themes/<id>/` (if using images)
- [ ] Tested in Expo Go — scroll through every screen
- [ ] Tested in both light and dark OS mode
- [ ] Tested with large text accessibility setting on
