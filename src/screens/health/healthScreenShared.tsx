/**
 * health/healthScreenShared.tsx
 * Types, constants, and small presentational helpers shared across HealthScreen
 * sub-components. Extracted from HealthScreen.tsx — no logic changes.
 */
import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, Animated, Dimensions } from "react-native";
import Svg, { Path, Rect, Defs, ClipPath, Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { ThemedIcon } from "../../theme/iconRegistry";
import { emojiForWaterCount } from "../../lib/mealEmoji";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GlucoseReading = {
  recorded_at: string;
  mg_dl: number;
};

export type HRReading = {
  recorded_at: string;
  bpm: number;
};

export type GlucoseStatus = {
  hasData: boolean;
  mg_dl: number | null;
  arrow: string | null;
  delta: number | null;
  isStale: boolean;
  minutesSinceReading: number | null;
  alerts: string[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const RANGE_OPTIONS = [3, 6, 12, 24];
export const SCREEN_WIDTH = Dimensions.get("window").width;
export const CHART_WIDTH = SCREEN_WIDTH - 64;
export const CARD_GAP = 10;
export const HALF_CARD_WIDTH = (SCREEN_WIDTH - 32 - CARD_GAP) / 2 - 4;
export const CHIP_GAP = 8;
export const CHIP_WIDTH = (SCREEN_WIDTH - 32 - CHIP_GAP * 2) / 3;
export const CHART_HEIGHT = 200;
export const PAD_LEFT = 32;
export const PAD_BOTTOM = 20;
export const PAD_TOP = 14;
export const DEFAULT_WATER_GOAL = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildPoints(readings: GlucoseReading[], windowStart: number, windowEnd: number, minVal: number, maxVal: number): string {
  const usableWidth = CHART_WIDTH - PAD_LEFT;
  const usableHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const windowMs = windowEnd - windowStart;

  return readings
    .map(function (r: GlucoseReading) {
      const t = new Date(r.recorded_at).getTime();
      const x = PAD_LEFT + ((t - windowStart) / windowMs) * usableWidth;
      const y = PAD_TOP + usableHeight - ((Number(r.mg_dl) - minVal) / (maxVal - minVal)) * usableHeight;
      return x + "," + y;
    })
    .join(" ");
}

export function getTimeTicks(windowStart: number, windowEnd: number, rangeHours: number): Array<{ t: number; label: string }> {
  const intervalMins = rangeHours <= 3 ? 15 : rangeHours <= 6 ? 30 : rangeHours <= 12 ? 60 : 120;
  const intervalMs = intervalMins * 60 * 1000;
  const showMins = rangeHours <= 6;
  const ticks: Array<{ t: number; label: string }> = [];
  for (let t = Math.ceil(windowStart / intervalMs) * intervalMs; t <= windowEnd; t += intervalMs) {
    const d = new Date(t);
    const h = d.getHours();
    const m = d.getMinutes();
    const ap = h >= 12 ? "p" : "a";
    const h12 = h % 12 || 12;
    ticks.push({ t, label: showMins ? `${h12}:${String(m).padStart(2, "0")}${ap}` : `${h12}${ap}` });
  }
  return ticks;
}

export function buildHRSparkPoints(readings: Array<{ recorded_at: string; bpm: number }>, width: number, height: number): string {
  if (readings.length < 2) return "";
  const bpms = readings.map((r) => r.bpm);
  const minB = Math.min(...bpms);
  const maxB = Math.max(...bpms);
  const rangeB = maxB - minB || 1;
  const times = readings.map((r) => new Date(r.recorded_at).getTime());
  const minT = times[0];
  const rangeT = (times[times.length - 1] - minT) || 1;
  const pad = 3;
  return readings.map((r, i) => {
    const x = ((times[i] - minT) / rangeT) * width;
    const y = (height - pad) - ((r.bpm - minB) / rangeB) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function formatSleepDuration(start: string, end: string): string {
  const totalMins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? h + "h " + m + "m" : h + "h";
}

export function sumTodayLogs(logs: Array<{ logged_at: string; value: number }>): number {
  const today = new Date().toDateString();
  return logs
    .filter((l) => new Date(l.logged_at).toDateString() === today)
    .reduce((sum, l) => sum + Number(l.value), 0);
}

// ─── WaterDropletLarge ────────────────────────────────────────────────────────

export function WaterDropletLarge({ count, goal, color }: { count: number; goal: number; color: string }) {
  const W = 72, H = 88;
  const DROP = "M36,5 C28,18 8,42 8,63 C8,78.5 21,88 36,88 C51,88 64,78.5 64,63 C64,42 44,18 36,5Z";
  const fillPct = goal > 0 ? Math.min(1, count / goal) : 0;
  const fillH = H * fillPct;
  const fillY = H - fillH;
  const textColor = fillPct > 0.35 ? "#fff" : color;
  return (
    <View style={{ width: W, height: H, alignItems: "center", justifyContent: "center" }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }}>
        <Defs>
          <ClipPath id="wdropL">
            <Path d={DROP} />
          </ClipPath>
        </Defs>
        <Path d={DROP} fill={color} opacity={0.12} />
        <Path d={DROP} fill="none" stroke={color} strokeWidth="2.5" opacity={0.4} />
        {fillH > 0 && (
          <Rect x={0} y={fillY} width={W} height={fillH + 1} fill={color} opacity={0.85} clipPath="url(#wdropL)" />
        )}
      </Svg>
      <Text style={{ position: "absolute", fontSize: 22, fontWeight: "900", color: textColor, bottom: 18 }}>
        {count}
      </Text>
      <Text style={{ position: "absolute", fontSize: 10, fontWeight: "700", color: textColor, bottom: 6, opacity: 0.75 }}>
        / {goal}
      </Text>
    </View>
  );
}

// ─── WaterRing ────────────────────────────────────────────────────────────────

export function WaterRing({ count, goal, color }: { count: number; goal: number; color: string }) {
  const SIZE = 44;
  const R = 18, SW = 4;
  const CX = SIZE / 2, CY = SIZE / 2;
  const circumference = 2 * Math.PI * R;
  const pct = goal > 0 ? Math.min(1, count / goal) : 0;
  const dash = circumference * pct;
  const gap = circumference - dash;
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
        <Circle cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth={SW} opacity={0.2} />
        {pct > 0 && (
          <Circle
            cx={CX} cy={CY} r={R}
            fill="none" stroke={color} strokeWidth={SW}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            rotation={-90} origin={`${CX}, ${CY}`}
          />
        )}
      </Svg>
      <Text style={{ fontSize: 13, fontWeight: "900", color }}>{count}</Text>
    </View>
  );
}

// ─── MiniDroplet ──────────────────────────────────────────────────────────────

export function MiniDroplet({ count, goal, color }: { count: number; goal: number; color: string }) {
  const VW = 28, VH = 34;
  const W = 44, H = 54;
  const DROP = "M14,2 C10,7 3,16 3,24 C3,30 8,34 14,34 C20,34 25,30 25,24 C25,16 18,7 14,2Z";
  const fillPct = goal > 0 ? Math.min(1, count / goal) : 0;
  const fillH = VH * fillPct;
  const fillY = VH - fillH;
  return (
    <Svg width={W} height={H} viewBox={`0 0 ${VW} ${VH}`}>
      <Defs><ClipPath id="miniDrop"><Path d={DROP} /></ClipPath></Defs>
      <Path d={DROP} fill={color} opacity={0.15} />
      <Path d={DROP} fill="none" stroke={color} strokeWidth="2" opacity={0.5} />
      {fillH > 0 && <Rect x={0} y={fillY} width={W} height={fillH + 1} fill={color} opacity={0.85} clipPath="url(#miniDrop)" />}
    </Svg>
  );
}

// ─── WaterDropletButton ───────────────────────────────────────────────────────

export function WaterDropletButton({ count, goal, color, onPress }: { count: number; goal: number; color: string; onPress: () => void }) {
  const { theme } = useTheme();
  const W = 72, H = 88;
  const DROP = "M36,5 C28,18 8,42 8,63 C8,78.5 21,88 36,88 C51,88 64,78.5 64,63 C64,42 44,18 36,5Z";
  const fillPct = goal > 0 ? Math.min(1, count / goal) : 0;
  const fillH = H * fillPct;
  const fillY = H - fillH;
  const labelColor = fillPct > 0.5 ? "#fff" : color;
  return (
    <Pressable onPress={onPress} accessibilityLabel="Log one glass of water" style={{ width: W, height: H }}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute" }}>
        <Defs>
          <ClipPath id="wdropBtn">
            <Path d={DROP} />
          </ClipPath>
        </Defs>
        <Path d={DROP} fill={color} opacity={0.12} />
        <Path d={DROP} fill="none" stroke={color} strokeWidth="2.5" opacity={0.45} />
        {fillH > 0 && (
          <Rect x={0} y={fillY} width={W} height={fillH + 1} fill={color} opacity={0.88} clipPath="url(#wdropBtn)" />
        )}
        <Path d={DROP} fill="none" stroke={theme.ink} strokeWidth="1.5" opacity={0.3} />
      </Svg>
      <View style={{ position: "absolute", bottom: 14, left: 0, right: 0, alignItems: "center" }}>
        <Text style={{ fontSize: 14, marginBottom: 1 }}>{emojiForWaterCount(count)}</Text>
        <Text style={{ fontSize: 18, fontWeight: "900", color: labelColor }}>+1</Text>
      </View>
    </Pressable>
  );
}

// ─── StepsRing ────────────────────────────────────────────────────────────────

export function StepsRing({ steps, goal, color, sub }: { steps: number | null; goal: number; color: string; sub: string }) {
  const R = 19, SW = 3.5;
  const SIZE = (R + SW) * 2 + 4;
  const CX = SIZE / 2, CY = SIZE / 2;
  const circumference = 2 * Math.PI * R;
  const pct = steps !== null && goal > 0 ? Math.min(1, steps / goal) : 0;
  const dash = circumference * pct;
  const gap = circumference - dash;
  const goalHit = steps !== null && goal > 0 && steps >= goal;
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <Svg width={SIZE} height={SIZE} style={{ position: "absolute" }}>
        <Circle cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth={SW} opacity={0.2} />
        {pct > 0 && (
          <Circle
            cx={CX} cy={CY} r={R}
            fill="none" stroke={color} strokeWidth={SW}
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="round"
            rotation={-90} origin={`${CX}, ${CY}`}
          />
        )}
      </Svg>
      {goalHit ? (
        <Ionicons name="checkmark-circle" size={20} color={color} />
      ) : (
        <ThemedIcon slot="metric.steps" size={44} color={sub} />
      )}
    </View>
  );
}

// ─── PopText ──────────────────────────────────────────────────────────────────

/** Chip value text that "pops" (scale pulse) whenever its value changes. */
export function PopText({ value, style }: { value: string; style: any }) {
  const scale = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && prev.current !== "--") {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.18, duration: 120, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
    prev.current = value;
  }, [value, scale]);
  return (
    <Animated.Text
      style={[style, { transform: [{ scale }] }]}
      allowFontScaling
      maxFontSizeMultiplier={1.3}
    >
      {value}
    </Animated.Text>
  );
}

// ─── SectionDivider ───────────────────────────────────────────────────────────

export function SectionDivider({ label }: { label: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 2 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.cardBorder, opacity: 0.6 }} />
      <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 0.9, color: theme.textSoft }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: theme.cardBorder, opacity: 0.6 }} />
    </View>
  );
}
