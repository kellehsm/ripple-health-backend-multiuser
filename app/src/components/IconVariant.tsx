/**
 * IconVariant — semantic icon wrapper.
 *
 * Instead of hard-coding Ionicons name suffixes ("-outline" vs solid) at
 * every call site, pass a semantic name + variant + state. The wrapper
 * picks the right Ionicons name and colors it by state.
 *
 * This lets us swap the icon library later (custom Ripple icon set) with
 * one-line change here instead of touching every screen.
 */

import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export type IconName =
  | "home" | "heart" | "meals" | "life" | "finance"
  | "settings" | "profile" | "search" | "add" | "close"
  | "chevronRight" | "chevronLeft" | "chevronDown" | "chevronUp"
  | "bookmark" | "share" | "trash" | "edit" | "info"
  | "check" | "warning" | "error"
  | "sleep" | "steps" | "glucose" | "water" | "mood" | "mindfulness"
  | "book" | "hobby" | "exercise" | "medication" | "cycle"
  | "streak" | "insight" | "trend" | "sparkles";

export type IconState = "default" | "active" | "muted" | "danger" | "success" | "warning";

interface Props {
  name: IconName;
  variant?: "line" | "filled";
  state?: IconState;
  size?: number;
  color?: string;
  style?: any;
}

const LINE: Record<IconName, string> = {
  home: "home-outline", heart: "heart-outline", meals: "restaurant-outline", life: "book-outline", finance: "wallet-outline",
  settings: "settings-outline", profile: "person-outline", search: "search-outline", add: "add-outline", close: "close-outline",
  chevronRight: "chevron-forward", chevronLeft: "chevron-back", chevronDown: "chevron-down", chevronUp: "chevron-up",
  bookmark: "bookmark-outline", share: "share-outline", trash: "trash-outline", edit: "pencil-outline", info: "information-circle-outline",
  check: "checkmark-outline", warning: "warning-outline", error: "alert-circle-outline",
  sleep: "moon-outline", steps: "walk-outline", glucose: "pulse-outline", water: "water-outline", mood: "happy-outline", mindfulness: "leaf-outline",
  book: "book-outline", hobby: "bicycle-outline", exercise: "barbell-outline", medication: "medkit-outline", cycle: "flower-outline",
  streak: "flame-outline", insight: "bulb-outline", trend: "trending-up-outline", sparkles: "sparkles-outline",
};
const FILLED: Record<IconName, string> = {
  home: "home", heart: "heart", meals: "restaurant", life: "book", finance: "wallet",
  settings: "settings", profile: "person", search: "search", add: "add-circle", close: "close-circle",
  chevronRight: "chevron-forward", chevronLeft: "chevron-back", chevronDown: "chevron-down", chevronUp: "chevron-up",
  bookmark: "bookmark", share: "share", trash: "trash", edit: "pencil", info: "information-circle",
  check: "checkmark-circle", warning: "warning", error: "alert-circle",
  sleep: "moon", steps: "walk", glucose: "pulse", water: "water", mood: "happy", mindfulness: "leaf",
  book: "book", hobby: "bicycle", exercise: "barbell", medication: "medkit", cycle: "flower",
  streak: "flame", insight: "bulb", trend: "trending-up", sparkles: "sparkles",
};

export function IconVariant({ name, variant = "line", state = "default", size = 20, color, style }: Props) {
  const { theme } = useTheme();
  const ionicName = (variant === "filled" ? FILLED : LINE)[name] as any;

  const stateColor: Record<IconState, string> = {
    default: theme.textStrong,
    active:  theme.primary,
    muted:   theme.textSoft,
    danger:  theme.danger,
    success: theme.success,
    warning: theme.warning,
  };

  return <Ionicons name={ionicName} size={size} color={color ?? stateColor[state]} style={style} />;
}
