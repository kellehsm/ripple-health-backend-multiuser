/**
 * overview/shared.tsx
 * Types, constants, and small presentational helpers shared across Overview
 * sub-components. Extracted from OverviewScreen.tsx — no logic changes.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Animated,
  Dimensions,
  StyleSheet,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Svg, { Rect, Path, Defs, ClipPath } from "react-native-svg";
import { useTheme } from "../../theme/ThemeContext";
import { useReduceMotion } from "../../hooks/useReduceMotion";
import { onSolid } from "../../theme/colorUtils";
import { ThemedIcon } from "../../theme/iconRegistry";
import { BUCKET_ORDER, BUCKET_LABEL, type MoodBucket } from "../../constants";
import { type QuickLogKind } from "../../components/QuickLogSheet";

// ─── Types ────────────────────────────────────────────────────────────────────

export type JournalEntry = {
  id: string;
  logged_at: string;
  mood_score: number;
  mood_label: string | null;
  entry_text: string | null;
  period: string | null;
  entry_type: string;
};

export type WeeklyDay = {
  date: string;
  avg_mood: number | null;
  sleep_hours: number;
  total_spent: number;
};

export type PatternEvent = {
  time: string;
  type: "mood" | "spend" | "meal" | "glucose_spike" | "water" | "hobby";
  label: string;
  entry_type?: string;
  period?: string;
};

export type GlucoseReading = { recorded_at: string; mg_dl: number };

export type DayEvent = {
  time: string;
  type: "mood" | "meal" | "spend";
  label: string;
  entry_type?: string;
  mood_score?: number;
  carbs_g?: number | null;
};

export type WeeklyDigest = {
  glucose_by_tod: Partial<Record<string, { avg: number; count: number }>>;
  meal_flags: Array<{ label: string }>;
  spending_spikes: Array<{ label: string }>;
  heart_rate: { has_data: boolean; resting?: number; peak?: number };
  steps: { this_week: number; last_week: number };
  hobbies: { this_week_sessions: number; last_week_sessions: number };
  exercise?: { sessions_this_week: number; total_minutes_this_week: number };
  books?: { finished_this_month: number };
  mood?: { avg_this_week: number | null };
};

export type GlucoseStatus = { hasData: boolean; mg_dl: number | null; arrow: string | null };
export type SleepStats = { yesterday_seconds: number; seven_day_average_seconds: number };
export type Bucket = MoodBucket;

export type ChipData = {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: string;
  slot?: string;
  empty?: boolean;
  onPress?: () => void;
  tileId?: string;
  quickLog?: QuickLogKind;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const SCREEN_W = Dimensions.get("window").width;
export const CHART_W = SCREEN_W - 64;
export const CHIP_W = Math.floor((SCREEN_W - 32 - 16) / 3);
export const WATER_GOAL = 8;
export const CHART_H = 140;
export const PAD_L = 28;
export const PAD_B = 16;
export const PAD_T = 10;

export const CORR_W = SCREEN_W - 64;
export const CORR_H = 90;
export const BAR_W = Math.floor((CORR_W / 7) * 0.35);
export const STEP = CORR_W / 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function timeOfDayBucket(date: Date): Bucket {
  const h = date.getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 16) return "afternoon";
  if (h >= 16 && h < 21) return "evening";
  return "night";
}

export function getGreeting(): { text: string; emojiSlot: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: "Good morning",   emojiSlot: "greeting.morning"   };
  if (hour < 17) return { text: "Good afternoon", emojiSlot: "greeting.afternoon" };
  return           { text: "Good evening",   emojiSlot: "greeting.evening"   };
}

export function streakMotivationMessage(maxStreak: number): string | null {
  if (maxStreak >= 100) return "100 days! You're in rare company 🏆";
  if (maxStreak >= 60) return "Two months of showing up — unstoppable 🌟";
  if (maxStreak >= 30) return "One full month! You've built a real habit 💪";
  if (maxStreak >= 20) return "20 days strong — this is who you are now 🔥";
  if (maxStreak >= 10) return "Double digits! Keep the momentum going 🎯";
  if (maxStreak >= 5) return "5 days in — the habit is forming 🌱";
  return null;
}

// ─── SkeletonBox ─────────────────────────────────────────────────────────────

export function SkeletonBox({ style }: { style?: object }) {
  const { theme } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) return;
    Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1100, useNativeDriver: true })
    ).start();
  }, [shimmer, reduceMotion]);
  const translateX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-150, SCREEN_W + 50] });
  return (
    <View style={[{ backgroundColor: theme.cardBorder, borderRadius: 16, overflow: "hidden" }, style]}>
      {!reduceMotion && (
        <Animated.View style={{ position: "absolute", top: 0, bottom: 0, width: 120, transform: [{ translateX }] }}>
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.15)", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
    </View>
  );
}

// ─── WaterDroplet ─────────────────────────────────────────────────────────────

export function WaterDroplet({ count, fillPct, color }: { count: number; fillPct: number; color: string }) {
  const VW = 32, VH = 38;
  const W = 40, H = 48;
  const DROP = "M16,3 C12,8 4,18 4,27 C4,34.2 9.4,38 16,38 C22.6,38 28,34.2 28,27 C28,18 20,8 16,3Z";
  const fillH = VH * fillPct;
  const fillY = VH - fillH;
  return (
    <View style={{ width: W, height: H, alignItems: "center", justifyContent: "center" }}>
      <Svg width={W} height={H} viewBox={`0 0 ${VW} ${VH}`} style={{ position: "absolute" }}>
        <Defs>
          <ClipPath id="wdrop">
            <Path d={DROP} />
          </ClipPath>
        </Defs>
        <Path d={DROP} fill="none" stroke={color} strokeWidth="2" opacity={0.3} />
        {fillH > 0 && (
          <Rect x={0} y={fillY} width={VW} height={fillH + 1} fill={color} opacity={0.7} clipPath="url(#wdrop)" />
        )}
      </Svg>
      <Text style={{ position: "absolute", bottom: 8, fontSize: 12, lineHeight: 15, fontWeight: "900", color: fillPct > 0.3 ? "#fff" : color }}>
        {count}
      </Text>
    </View>
  );
}

// ─── AnimatedCounterText ──────────────────────────────────────────────────────

export function AnimatedCounterText({
  animValue,
  targetValue,
  style,
  format,
}: {
  animValue: Animated.Value;
  targetValue: number;
  style?: object;
  format?: (v: number) => string;
}) {
  const interpolated = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, targetValue],
  });
  const [display, setDisplay] = useState(() => (format ? format(0) : "0"));
  useEffect(() => {
    const id = (interpolated as any).addListener(({ value }: { value: number }) => {
      setDisplay(format ? format(Math.floor(value)) : String(Math.floor(value)));
    });
    return () => (interpolated as any).removeListener(id);
  }, [interpolated, format]);
  return <Text style={style} numberOfLines={1}>{display}</Text>;
}

// ─── AnimatedChip ─────────────────────────────────────────────────────────────

export function AnimatedChip({
  entranceAnim,
  children,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  chipWidth,
  dimmed,
  style,
  accessibilityLabel,
  accessibilityRole,
}: {
  entranceAnim: Animated.Value;
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  chipWidth?: number;
  dimmed?: boolean;
  style?: object;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "none" | "link" | "search" | "image" | "keyboardkey" | "text" | "adjustable" | "imagebutton" | "header" | "summary" | "checkbox" | "combobox" | "menu" | "menubar" | "menuitem" | "progressbar" | "radio" | "radiogroup" | "scrollbar" | "spinbutton" | "switch" | "tab" | "tablist" | "timer" | "toolbar";
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Haptics.selectionAsync();
    Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true, damping: 18, stiffness: 400 }).start();
    onPressIn?.();
  };
  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 400 }).start();
    onPressOut?.();
  };

  const entranceOpacity = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const entranceTranslateY = entranceAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <View style={{ width: chipWidth }}>
      <Animated.View style={{ opacity: entranceOpacity, transform: [{ translateY: entranceTranslateY }] }}>
        <Animated.View style={{ opacity: dimmed ? 0.55 : 1, transform: [{ scale: scaleAnim }] }}>
          <Pressable
            onPress={onPress}
            onLongPress={onLongPress}
            delayLongPress={400}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={[style, { width: chipWidth }]}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole={accessibilityRole}
          >
            {children}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
