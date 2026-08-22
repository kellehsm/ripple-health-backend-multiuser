/**
 * Icon registry — every icon slot in the app resolves through here.
 *
 * Slots are stable string IDs (e.g. "metric.steps", "tab.wellness").
 * Each slot maps to an IconAsset which can be:
 *   • { type: "emoji",   value: "🏃" }          — rendered as <Text>
 *   • { type: "ionicon", name:  "walk" }         — rendered as <Ionicons>
 *   • { type: "image",   source: require(...) }  — rendered as <Image>
 *   • { type: "uri",     uri:   "https://..." }  — rendered as <Image> from URI
 *
 * A theme can override any slot by providing
 *   iconOverrides: Record<string, IconAsset>
 * in its Theme definition. Slots not overridden fall back to DEFAULT_ICONS.
 *
 * Usage:
 *   <ThemedIcon slot="metric.steps" size={22} color={theme.teal.solid} />
 */

import React from "react";
import { Text, Image, ImageSourcePropType, StyleProp, TextStyle, ImageStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmojiAsset   = { type: "emoji";   value: string };
export type IoniconAsset = { type: "ionicon"; name: string };
// scale: multiplier applied to the slot's requested size (illustration icons
// like the Cozy Cat set read too small at emoji-equivalent sizes).
export type ImageAsset   = { type: "image";   source: ImageSourcePropType; scale?: number };
export type UriAsset     = { type: "uri";     uri: string; scale?: number };

export type IconAsset = EmojiAsset | IoniconAsset | ImageAsset | UriAsset;

// Convenience constructors
export const emoji   = (value: string):                EmojiAsset   => ({ type: "emoji",   value });
export const ionicon = (name: string):                 IoniconAsset => ({ type: "ionicon", name });
export const imgAsset= (source: ImageSourcePropType): ImageAsset   => ({ type: "image",   source });
export const uriAsset= (uri: string):                 UriAsset     => ({ type: "uri",     uri });

// ─── Default icon map ─────────────────────────────────────────────────────────

export const DEFAULT_ICONS: Record<string, IconAsset> = {

  // ── Tab bar ──────────────────────────────────────────────────────────────────
  "tab.wellness":    emoji("🧘"),
  "tab.meals":       emoji("🍜"),
  "tab.health_both": emoji("💜"),
  "tab.health_meds": emoji("💊"),
  "tab.health_cycle":emoji("🌸"),
  "tab.exercise":    emoji("🏃"),
  "tab.hobbies":     emoji("📖"),
  "tab.finance":     emoji("💳"),
  "tab.home":        emoji("🏠"),

  // ── Greeting ─────────────────────────────────────────────────────────────────
  "greeting.morning":   emoji("🌅"),
  "greeting.afternoon": emoji("☀️"),
  "greeting.evening":   emoji("🌆"),
  "greeting.night":     emoji("🌙"),

  // ── Metrics ──────────────────────────────────────────────────────────────────
  "metric.steps":    ionicon("walk"),
  "metric.sleep":    ionicon("moon"),
  "metric.water":    ionicon("water"),
  "metric.heart":    ionicon("heart-circle"),
  "metric.glucose":  ionicon("pulse"),
  "metric.mood":     emoji("💜"),
  "metric.exercise": ionicon("barbell"),

  // ── Mood scores ───────────────────────────────────────────────────────────────
  "mood.5": emoji("😃"),
  "mood.4": emoji("🙂"),
  "mood.3": emoji("😐"),
  "mood.2": emoji("😕"),
  "mood.1": emoji("😣"),

  // ── Meal types ────────────────────────────────────────────────────────────────
  "mealType.breakfast": emoji("🌅"),
  "mealType.lunch":     emoji("🌤️"),
  "mealType.dinner":    emoji("🌙"),
  "mealType.snack":     emoji("🍎"),

  // ── Screen / section icons ────────────────────────────────────────────────────
  "screen.mindfulness": emoji("🧘"),
  "screen.meals":       emoji("🍽️"),
  "screen.wellness":    emoji("❤️"),
  "screen.finance":     emoji("💰"),
  "screen.exercise":    emoji("🏃"),
  "screen.hobbies":     emoji("📖"),
  "screen.fasting":     emoji("⏱️"),
  "screen.friends":     emoji("👥"),
  "screen.insights":    emoji("💡"),
  "screen.sleep":       emoji("🌙"),
  "screen.water":       emoji("💧"),
  "screen.heart":       emoji("❤️"),
  "screen.glucose":     ionicon("pulse"),
  "screen.mood":        emoji("💜"),
  "screen.health":      emoji("🩺"),

  // ── Insights filter categories ────────────────────────────────────────────────
  "insight.all":         emoji("✨"),
  "insight.wellness":    emoji("❤️"),
  "insight.mindfulness": emoji("🧠"),
  "insight.hobbies":     emoji("🎨"),
  "insight.medication":  emoji("💊"),
  "insight.exercise":    emoji("🏋️"),
  "insight.finance":     emoji("💰"),
  "insight.cycle":       emoji("🌸"),
  "insight.combined":    emoji("🔗"),

  // ── Misc UI ───────────────────────────────────────────────────────────────────
  "ui.flag":        emoji("🚩"),
  "ui.seedling":    emoji("🌱"),
  "ui.sparkle":     emoji("✨"),
  "ui.bulb":        emoji("💡"),
  "ui.trophy":      emoji("🏆"),
  "ui.celebrate":   emoji("🎉"),
  "ui.gratitude":   emoji("🙏"),
  "ui.shuffle":     emoji("🔀"),
  "ui.bell":        emoji("🔔"),
  "ui.headphones":  emoji("🎧"),
  "ui.music":       emoji("🎵"),
  "ui.mute":        emoji("🔇"),
  "ui.lightning":   emoji("⚡"),
  "ui.breath":      emoji("🌬️"),
  "ui.gym":         emoji("🏋️"),
  "ui.run":         emoji("🏃"),
  "ui.mail":        emoji("💌"),
  "ui.map":         emoji("🗺️"),
  "ui.chart":       emoji("📊"),
  "ui.flask":       emoji("🧪"),
  "ui.search":      emoji("🔍"),
  "ui.hand":        emoji("✋"),
  "ui.clock_alarm": emoji("⏰"),
  "ui.medal":       emoji("🏅"),
  "ui.target":      emoji("🎯"),
  "ui.freeze":      emoji("❄️"),
  "ui.pin":         emoji("📌"),

  // ── Empty states ──────────────────────────────────────────────────────────────
  "empty.books":    emoji("📚"),
  "empty.heart":    emoji("💓"),
  "empty.trend":    emoji("📈"),
  "empty.glucose":  emoji("🩸"),
  "empty.clock":    emoji("🕐"),
  "empty.steps":    emoji("👟"),
  "empty.warning":  emoji("⚠️"),
  "empty.insights": emoji("💡"),
  "empty.default":  emoji("📭"),

  // ── Medication history event types ────────────────────────────────────────────
  "medHistory.added":              emoji("✅"),
  "medHistory.dose_changed":       emoji("💊"),
  "medHistory.frequency_changed":  emoji("🕐"),
  "medHistory.prescriber_changed": emoji("🩺"),
  "medHistory.stopped":            emoji("🛑"),
  "medHistory.list":               emoji("📋"),

  // ── Exercise suggestion types ─────────────────────────────────────────────────
  "exerciseSuggestion.rest_day":           emoji("😴"),
  "exerciseSuggestion.neglected_muscle":   emoji("🎯"),
  "exerciseSuggestion.program_gap":        emoji("📋"),
  "exerciseSuggestion.preferred_day":      emoji("📅"),
  "exerciseSuggestion.consistency_streak": emoji("🔥"),
  "exerciseSuggestion.low_completion":     emoji("⏱️"),
  "exerciseSuggestion.no_history":         emoji("🏋️"),
  "exerciseSuggestion.generic":            emoji("💪"),

  // ── Mindfulness section tiles ─────────────────────────────────────────────────
  "mindfulness.breathing":  emoji("🫁"),
  "mindfulness.grounding":  emoji("🌿"),
  "mindfulness.meditation": emoji("⏱"),
  "mindfulness.gratitude":  emoji("📓"),
  "mindfulness.body_scan":  emoji("🧘"),
  "mindfulness.sounds":     emoji("🎧"),

  // ── Mindfulness session milestones ────────────────────────────────────────────
  "milestone.1":   emoji("🌱"),
  "milestone.5":   emoji("🌿"),
  "milestone.10":  emoji("🌊"),
  "milestone.20":  emoji("🧘"),
  "milestone.50":  emoji("⭐"),
  "milestone.100": emoji("🏆"),

  // ── Friends / social ──────────────────────────────────────────────────────────
  "social.nudge":           emoji("👋"),
  "social.steps_streak":    emoji("👟"),
  "social.exercise_streak": emoji("💪"),
  "social.book_streak":     emoji("📖"),

  // ── Overview / health block icons ─────────────────────────────────────────────
  "health.meds_block":     emoji("💊"),
  "health.cycle_block":    emoji("🌸"),
  "health.symptoms_block": emoji("📝"),
  "health.water_block":    emoji("💧"),
  "health.goal":           emoji("🎯"),

  // ── Insights correlations ─────────────────────────────────────────────────────
  "insight.sleep_corr":   emoji("🌙"),
  "insight.finance_corr": emoji("💰"),
};

// ─── Resolver ─────────────────────────────────────────────────────────────────

/** Resolve the IconAsset for a slot, respecting per-theme overrides. */
export function resolveIcon(slot: string, overrides?: Record<string, IconAsset>): IconAsset | null {
  return overrides?.[slot] ?? DEFAULT_ICONS[slot] ?? null;
}

// ─── ThemedIcon component ─────────────────────────────────────────────────────

type ThemedIconProps = {
  /** Slot ID, e.g. "metric.steps" */
  slot: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle | ImageStyle>;
  /** If true, use reduced opacity when inactive (e.g. tab bar) */
  inactive?: boolean;
};

/**
 * Renders the correct asset type for a given icon slot.
 * Checks theme.iconOverrides before falling back to DEFAULT_ICONS.
 * Returns null if the slot is unknown.
 */
export function ThemedIcon({ slot, size = 22, color, style, inactive = false }: ThemedIconProps) {
  const { theme } = useTheme();
  const asset = resolveIcon(slot, (theme as any).iconOverrides);

  if (!asset) return null;

  const opacityStyle = inactive ? { opacity: 0.45 } : undefined;

  switch (asset.type) {
    case "emoji":
      return (
        <Text
          style={[
            { fontSize: size, lineHeight: size + 4, textAlign: "center", includeFontPadding: false },
            opacityStyle,
            style as StyleProp<TextStyle>,
          ]}
        >
          {asset.value}
        </Text>
      );

    case "ionicon":
      return (
        <Ionicons
          name={asset.name as any}
          size={size}
          color={color ?? "#888"}
          style={[opacityStyle, style] as any}
        />
      );

    case "image": {
      const s = size * (asset.scale ?? 1);
      return (
        <Image
          source={asset.source}
          style={[
            { width: s, height: s, resizeMode: "contain" },
            opacityStyle,
            style as StyleProp<ImageStyle>,
          ]}
        />
      );
    }

    case "uri": {
      const s = size * (asset.scale ?? 1);
      return (
        <Image
          source={{ uri: asset.uri }}
          style={[
            { width: s, height: s, resizeMode: "contain" },
            opacityStyle,
            style as StyleProp<ImageStyle>,
          ]}
        />
      );
    }
  }
}

// ─── Convenience: resolve mood score to slot ─────────────────────────────────

/** Maps a mood score (1–5) to its icon slot ID. */
export function moodScoreSlot(score: number): string {
  return `mood.${Math.min(5, Math.max(1, Math.round(score)))}`;
}

/** Returns the emoji string for a mood score, for places that still need a raw string. */
export function moodScoreEmoji(score: number): string {
  const asset = DEFAULT_ICONS[moodScoreSlot(score)];
  return asset?.type === "emoji" ? asset.value : "·";
}

/** Returns the emoji for a greeting period. */
export function greetingEmoji(hour: number): string {
  const slot = hour < 12 ? "greeting.morning" : hour < 17 ? "greeting.afternoon" : "greeting.evening";
  const asset = DEFAULT_ICONS[slot];
  return asset?.type === "emoji" ? asset.value : "";
}
