/**
 * Per-page theme templates.
 * Each template enumerates every themeable element on a specific screen:
 * which cards exist, which tiles exist, and which icon slots appear.
 *
 * Background resolution order for any element (page / card / tile):
 *   1. theme.pageBackgrounds[id]  / theme.cardBackgrounds[id]  / theme.tileBackgrounds[id]
 *   2. The default in the PageTemplate definition (always a color token)
 *
 * A ThemeableBackground with type "image" accepts either a require() result
 * (local asset) or a URI string. Use ThemedSurface to render it correctly.
 */

import React from "react";
import { Image, ImageBackground, View, StyleSheet, ImageSourcePropType } from "react-native";
import { useTheme } from "./ThemeContext";
import { useAppSettings } from "./AppSettingsContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ThemeableBackground =
  | { type: "color"; value: string }                      // theme token (e.g. "card") or hex
  | { type: "image"; value: ImageSourcePropType }         // require("../../assets/...") local image
  | { type: "uri";   value: string };                     // remote URL string

export type ThemeableCard = {
  id: string;
  label: string;
  background: ThemeableBackground;
  /** Key into Theme for border color, e.g. "cardBorder" */
  borderColorToken: string;
  /** When undefined, inherits global AppSettings.shadowsEnabled */
  shadowOverride?: boolean;
};

export type ThemeableTile = {
  id: string;
  label: string;
  background: ThemeableBackground;
  /** Icon slot ID — looked up in iconRegistry */
  iconSlot: string;
  /** Label slot ID — looked up in strings system */
  labelSlot: string;
};

export type PageTemplate = {
  pageId: string;
  pageName: string;
  background: ThemeableBackground;
  cards: ThemeableCard[];
  tiles: ThemeableTile[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function card(
  id: string,
  label: string,
  borderColorToken = "cardBorder",
): ThemeableCard {
  return {
    id,
    label,
    background: { type: "color", value: "card" },
    borderColorToken,
  };
}

function tile(
  id: string,
  label: string,
  iconSlot: string,
  bgToken = "card",
): ThemeableTile {
  return {
    id,
    label,
    background: { type: "color", value: bgToken },
    iconSlot,
    labelSlot: id + "_label",
  };
}

// ─── Per-screen templates ─────────────────────────────────────────────────────

export const OVERVIEW_TEMPLATE: PageTemplate = {
  pageId: "overview",
  pageName: "Home",
  background: { type: "color", value: "page" },
  cards: [
    card("wellness_snapshot", "Today's Snapshot"),
    card("streak_pills",      "Streak Badges"),
    card("fasting_timer",     "Fasting Timer"),
    card("timeline",          "Timeline"),
    card("insights_preview",  "Insights Preview"),
    card("mood_pattern",      "7-Day Mood Pattern"),
    card("cross_metric",      "Cross-Metric Insights"),
    card("seven_day_review",  "7-Day Review"),
  ],
  tiles: [
    tile("overview_steps",   "Steps",        "metric.steps",   "teal.tint"),
    tile("overview_mood",    "Mood",         "metric.mood",    "violet.tint"),
    tile("overview_water",   "Water",        "metric.water",   "blue.tint"),
    tile("overview_glucose", "Glucose",      "metric.glucose", "berry.tint"),
    tile("overview_sleep",   "Sleep",        "metric.sleep",   "amber.tint"),
  ],
};

export const WELLNESS_TEMPLATE: PageTemplate = {
  pageId: "wellness",
  pageName: "Wellness",
  background: { type: "color", value: "page" },
  cards: [
    card("mindfulness_banner",  "Mindfulness", "purple.solid"),
    card("sleep_card",          "Sleep"),
    card("glucose_card",        "Glucose"),
    card("heart_rate_card",     "Heart Rate"),
    card("water_card",          "Water"),
    card("steps_card",          "Steps"),
  ],
  tiles: [
    tile("wellness_steps",   "Steps",      "metric.steps",   "teal.tint"),
    tile("wellness_sleep",   "Sleep",      "metric.sleep",   "amber.tint"),
    tile("wellness_water",   "Water",      "metric.water",   "blue.tint"),
    tile("wellness_heart",   "Heart Rate", "metric.heart",   "berry.tint"),
  ],
};

export const MEALS_TEMPLATE: PageTemplate = {
  pageId: "meals",
  pageName: "Meals",
  background: { type: "color", value: "page" },
  cards: [
    card("meal_log",           "Meal Log"),
    card("food_report",        "Food Report"),
    card("glucose_panel",      "Glucose Response"),
  ],
  tiles: [
    tile("meal_breakfast", "Breakfast", "mealType.breakfast", "teal.tint"),
    tile("meal_lunch",     "Lunch",     "mealType.lunch",     "coral.tint"),
    tile("meal_dinner",    "Dinner",    "mealType.dinner",    "berry.tint"),
    tile("meal_snack",     "Snack",     "mealType.snack",     "purple.tint"),
  ],
};

export const LIFE_TEMPLATE: PageTemplate = {
  pageId: "life",
  pageName: "Life",
  background: { type: "color", value: "page" },
  cards: [
    card("hobbies_card",    "Hobbies"),
    card("books_card",      "Books"),
    card("substances_card", "Drinks & Substances"),
    card("mood_log_card",   "Mood"),
  ],
  tiles: [],
};

export const FINANCE_TEMPLATE: PageTemplate = {
  pageId: "finance",
  pageName: "Finance",
  background: { type: "color", value: "page" },
  cards: [
    card("spending_total",     "Spending Total"),
    card("spending_breakdown", "Where It Went"),
    card("transaction_list",   "Transactions"),
    card("mood_suggest",       "Spending–Mood Link"),
  ],
  tiles: [],
};

export const HEALTH_TAB_TEMPLATE: PageTemplate = {
  pageId: "health_tab",
  pageName: "Health (Med/Cycle)",
  background: { type: "color", value: "page" },
  cards: [
    card("med_schedule",    "Today's Schedule"),
    card("med_list",        "My Medications"),
    card("cycle_calendar",  "Cycle Calendar"),
    card("symptom_log",     "Symptoms"),
  ],
  tiles: [],
};

export const MINDFULNESS_TEMPLATE: PageTemplate = {
  pageId: "mindfulness",
  pageName: "Mindfulness",
  background: { type: "color", value: "page" },
  cards: [
    card("breathing_card",   "Breathing Exercise", "purple.solid"),
    card("gratitude_card",   "Gratitude", "purple.solid"),
    card("grounding_card",   "Grounding (5-4-3-2-1)", "purple.solid"),
    card("mindfulness_log",  "Recent Sessions"),
  ],
  tiles: [],
};

export const FRIENDS_TEMPLATE: PageTemplate = {
  pageId: "friends",
  pageName: "Friends",
  background: { type: "color", value: "page" },
  cards: [
    card("leaderboard_card", "Leaderboards"),
    card("challenges_card",  "Challenges"),
    card("activity_feed",    "Friend Activity"),
  ],
  tiles: [],
};

export const EXERCISE_TEMPLATE: PageTemplate = {
  pageId: "exercise",
  pageName: "Exercise",
  background: { type: "color", value: "page" },
  cards: [
    card("workout_card",  "Active Workout"),
    card("history_card",  "Exercise History"),
    card("plan_card",     "Workout Plan"),
  ],
  tiles: [],
};

export const INSIGHTS_TEMPLATE: PageTemplate = {
  pageId: "insights",
  pageName: "Insights",
  background: { type: "color", value: "page" },
  cards: [
    card("insight_list", "Pattern Insights"),
  ],
  tiles: [
    tile("filter_all",         "All",         "insight.all",         "card"),
    tile("filter_wellness",    "Wellness",    "insight.wellness",    "card"),
    tile("filter_mindfulness", "Mindfulness", "insight.mindfulness", "card"),
    tile("filter_hobbies",     "Hobbies",     "insight.hobbies",     "card"),
    tile("filter_medication",  "Medication",  "insight.medication",  "card"),
    tile("filter_exercise",    "Exercise",    "insight.exercise",    "card"),
    tile("filter_finance",     "Finance",     "insight.finance",     "card"),
    tile("filter_cycle",       "Cycle",       "insight.cycle",       "card"),
    tile("filter_combined",    "Combined",    "insight.combined",    "card"),
  ],
};

export const SETTINGS_TEMPLATE: PageTemplate = {
  pageId: "settings",
  pageName: "Settings",
  background: { type: "color", value: "page" },
  cards: [
    card("profile_card",    "Profile"),
    card("account_card",    "Account"),
    card("appearance_card", "Appearance"),
    card("tracking_card",   "Tracking"),
    card("notif_card",      "Notifications"),
    card("data_card",       "Data & Privacy"),
  ],
  tiles: [],
};

export const STEPS_DETAIL_TEMPLATE: PageTemplate = {
  pageId: "steps_detail",
  pageName: "Steps Detail",
  background: { type: "color", value: "page" },
  cards: [
    card("week_comparison",  "Week Comparison"),
    card("day_by_day",       "Day by Day"),
    card("daily_averages",   "Daily Averages"),
    card("month_over_month", "Month-over-Month"),
  ],
  tiles: [],
};

export const HEART_DETAIL_TEMPLATE: PageTemplate = {
  pageId: "heart_detail",
  pageName: "Heart Rate Detail",
  background: { type: "color", value: "page" },
  cards: [
    card("heart_rate_card", "Heart Rate Chart"),
    card("seven_day_hist",  "7-Day History"),
  ],
  tiles: [],
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export const PAGE_TEMPLATES: Record<string, PageTemplate> = {
  overview:    OVERVIEW_TEMPLATE,
  wellness:    WELLNESS_TEMPLATE,
  meals:       MEALS_TEMPLATE,
  life:        LIFE_TEMPLATE,
  finance:     FINANCE_TEMPLATE,
  health_tab:  HEALTH_TAB_TEMPLATE,
  mindfulness: MINDFULNESS_TEMPLATE,
  friends:     FRIENDS_TEMPLATE,
  exercise:    EXERCISE_TEMPLATE,
  insights:    INSIGHTS_TEMPLATE,
  settings:    SETTINGS_TEMPLATE,
  steps_detail:  STEPS_DETAIL_TEMPLATE,
  heart_detail:  HEART_DETAIL_TEMPLATE,
};

/** All themeable icon slots across every page template, deduplicated. */
export const ALL_ICON_SLOTS: string[] = Array.from(
  new Set(
    Object.values(PAGE_TEMPLATES).flatMap((t) => t.tiles.map((ti) => ti.iconSlot)),
  ),
);

// ─── Background resolution ────────────────────────────────────────────────────

/**
 * Resolve a ThemeableBackground for an element, checking theme overrides first.
 * `overrideMap` is theme.pageBackgrounds / theme.cardBackgrounds / theme.tileBackgrounds.
 * `defaultBg` is the template's default (always a color token).
 */
export function resolveBackground(
  id: string,
  defaultBg: ThemeableBackground,
  overrideMap?: Record<string, ThemeableBackground>,
): ThemeableBackground {
  return overrideMap?.[id] ?? defaultBg;
}

/**
 * Resolve a color-type background token to an actual hex string.
 * Handles dotted paths like "teal.tint" by walking the theme object.
 */
function resolveColorToken(token: string, theme: Record<string, any>): string {
  const parts = token.split(".");
  let val: any = theme;
  for (const p of parts) val = val?.[p];
  return typeof val === "string" ? val : token; // fall back to raw value (hex)
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/** Returns the resolved ThemeableBackground for a page. */
export function usePageBackground(pageId: string): ThemeableBackground {
  const { theme } = useTheme();
  const defaultBg = PAGE_TEMPLATES[pageId]?.background ?? { type: "color" as const, value: "page" };
  return resolveBackground(pageId, defaultBg, (theme as any).pageBackgrounds);
}

/** Returns the resolved ThemeableBackground for a card by its stable ID. */
export function useCardBackground(cardId: string): ThemeableBackground {
  const { theme } = useTheme();
  // Find the card's default in the template registry
  let defaultBg: ThemeableBackground = { type: "color", value: "card" };
  for (const tpl of Object.values(PAGE_TEMPLATES)) {
    const found = tpl.cards.find((c) => c.id === cardId);
    if (found) { defaultBg = found.background; break; }
  }
  return resolveBackground(cardId, defaultBg, (theme as any).cardBackgrounds);
}

/** Returns the resolved ThemeableBackground for a tile by its stable ID. */
export function useTileBackground(tileId: string): ThemeableBackground {
  const { theme } = useTheme();
  let defaultBg: ThemeableBackground = { type: "color", value: "card" };
  for (const tpl of Object.values(PAGE_TEMPLATES)) {
    const found = tpl.tiles.find((t) => t.id === tileId);
    if (found) { defaultBg = found.background; break; }
  }
  return resolveBackground(tileId, defaultBg, (theme as any).tileBackgrounds);
}

// ─── ThemedSurface ────────────────────────────────────────────────────────────

type ThemedSurfaceProps = {
  /** Stable element ID — looked up in pageBackgrounds / cardBackgrounds / tileBackgrounds */
  elementId: string;
  /** Which override map to check: page | card | tile */
  kind: "page" | "card" | "tile";
  style?: object;
  children?: React.ReactNode;
  /** Resize mode for image backgrounds. Default "cover". */
  resizeMode?: "cover" | "contain" | "stretch" | "center";
  /** Extra opacity for image backgrounds (0–1). Default 1. */
  imageOpacity?: number;
};

/**
 * Drop-in surface wrapper that renders the correct background for any
 * page, card, or tile — color, local image, or remote URI.
 *
 * Usage (card):
 *   <ThemedSurface elementId="sleep_card" kind="card" style={styles.card}>
 *     <Text>...</Text>
 *   </ThemedSurface>
 *
 * Usage (page):
 *   <ThemedSurface elementId="overview" kind="page" style={StyleSheet.absoluteFill} />
 */
export function ThemedSurface({
  elementId,
  kind,
  style,
  children,
  resizeMode = "cover",
  imageOpacity = 1,
}: ThemedSurfaceProps) {
  const { theme } = useTheme();
  const { elementBgImages } = useAppSettings();

  // User-picked image (Theme Studio) wins over theme overrides and defaults
  const userImg = elementBgImages[elementId];
  if (userImg) {
    return (
      <View style={[{ overflow: "hidden" }, style]}>
        <Image
          source={{ uri: userImg.uri }}
          resizeMode={resizeMode}
          style={[StyleSheet.absoluteFill, { opacity: userImg.opacity ?? 0.85 }]}
        />
        {children}
      </View>
    );
  }

  let bg: ThemeableBackground;
  if (kind === "page") {
    const defaultBg = PAGE_TEMPLATES[elementId]?.background ?? { type: "color" as const, value: "page" };
    bg = resolveBackground(elementId, defaultBg, (theme as any).pageBackgrounds);
  } else if (kind === "card") {
    let defaultBg: ThemeableBackground = { type: "color" as const, value: "card" };
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      const found = tpl.cards.find((c) => c.id === elementId);
      if (found) { defaultBg = found.background; break; }
    }
    bg = resolveBackground(elementId, defaultBg, (theme as any).cardBackgrounds);
  } else {
    let defaultBg: ThemeableBackground = { type: "color" as const, value: "card" };
    for (const tpl of Object.values(PAGE_TEMPLATES)) {
      const found = tpl.tiles.find((t) => t.id === elementId);
      if (found) { defaultBg = found.background; break; }
    }
    bg = resolveBackground(elementId, defaultBg, (theme as any).tileBackgrounds);
  }

  if (bg.type === "color") {
    const color = resolveColorToken(bg.value, theme as any);
    return <View style={[{ backgroundColor: color }, style]}>{children}</View>;
  }

  const source = bg.type === "uri" ? { uri: bg.value } : bg.value as ImageSourcePropType;

  return (
    <ImageBackground
      source={source}
      resizeMode={resizeMode}
      style={style}
      imageStyle={{ opacity: imageOpacity }}
    >
      {children}
    </ImageBackground>
  );
}
