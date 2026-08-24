/**
 * MealCards — self-contained display components used by MealsScreen.
 * Contains: MiniGlucoseChart, MealsEmptyState, MacroDonut.
 */
import React, { useState } from "react";
import { View, Text, Pressable, Dimensions } from "react-native";
import Svg, { Polyline, Text as SvgText, Circle } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { onSolid } from "../../theme/colorUtils";
import { useTheme } from "../../theme/ThemeContext";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GlucoseReading = {
  recorded_at: string;
  mg_dl: number;
};

// ─── Chart dimensions ─────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;
const MINI_CHART_WIDTH = SCREEN_WIDTH - 96;
const MINI_CHART_HEIGHT = 100;
const MC_PAD_LEFT = 24;
const MC_PAD_BOTTOM = 16;
const MC_PAD_TOP = 10;

function buildMiniPoints(
  readings: GlucoseReading[],
  windowStart: number,
  windowEnd: number,
  minVal: number,
  maxVal: number
): string {
  const windowMs = windowEnd - windowStart;
  if (windowMs === 0) return "";
  const usableWidth = MINI_CHART_WIDTH - MC_PAD_LEFT;
  const usableHeight = MINI_CHART_HEIGHT - MC_PAD_TOP - MC_PAD_BOTTOM;
  return readings
    .map(function (r) {
      const t = new Date(r.recorded_at).getTime();
      const x = MC_PAD_LEFT + ((t - windowStart) / windowMs) * usableWidth;
      const y =
        MC_PAD_TOP +
        usableHeight -
        ((Number(r.mg_dl) - minVal) / (maxVal - minVal)) * usableHeight;
      return x + "," + y;
    })
    .join(" ");
}

// ─── MiniGlucoseChart ─────────────────────────────────────────────────────────

export function MiniGlucoseChart({
  readings,
  mealLoggedAt,
}: {
  readings: GlucoseReading[];
  mealLoggedAt: string | null;
}) {
  const { theme } = useTheme();
  const ink = theme.ink;
  const nav = useNavigation<any>();
  if (readings.length === 0) {
    return (
      <View>
        <Text style={{ color: theme.textSoft, fontSize: 12 }}>
          No glucose readings found for this meal window.
        </Text>
        <Pressable onPress={() => nav.navigate("SettingsDexcom")} hitSlop={6} style={{ marginTop: 4 }}>
          <Text style={{ color: theme.berry.solid, fontSize: 12, fontWeight: "800" }}>
            Connect Dexcom →
          </Text>
        </Pressable>
      </View>
    );
  }

  const values = readings.map(function (r) { return Number(r.mg_dl); });
  const minVal = Math.min.apply(null, values.concat([70])) - 5;
  const maxVal = Math.max.apply(null, values.concat([140])) + 10;
  const times = readings.map(function (r) { return new Date(r.recorded_at).getTime(); });
  const windowStart = Math.min.apply(null, times);
  const windowEnd = Math.max.apply(null, times);
  const points = buildMiniPoints(readings, windowStart, windowEnd, minVal, maxVal);

  const peakIdx = values.indexOf(Math.max.apply(null, values));
  const peakVal = values[peakIdx];
  const peakTime = times[peakIdx];

  let summaryText = "Peak: " + peakVal + " mg/dL";
  if (mealLoggedAt) {
    const mealTime = new Date(mealLoggedAt).getTime();
    const minutesAfter = Math.round((peakTime - mealTime) / 60000);
    if (minutesAfter > 0) {
      summaryText = "Peaked at " + peakVal + " mg/dL, " + minutesAfter + " min after eating";
    }
  }

  const isHighResponse = peakVal > 180;
  const chartLineColor = isHighResponse ? theme.red.solid : theme.berry.sub;

  return (
    <View style={{ marginTop: 4, borderRadius: 12, borderWidth: isHighResponse ? 1.5 : 0, borderColor: isHighResponse ? theme.red.solid : "transparent", padding: isHighResponse ? 4 : 0 }}>
      {isHighResponse && (
        <Text style={{ color: theme.red.fg, fontSize: 10, fontWeight: "700", marginBottom: 2 }}>⚠ HIGH RESPONSE ({peakVal} mg/dL)</Text>
      )}
      {points.length > 0 && (
        <Svg width={MINI_CHART_WIDTH} height={MINI_CHART_HEIGHT}>
          <SvgText x={0} y={MC_PAD_TOP + 6} fontSize={9} fill={theme.textSoft}>{Math.round(maxVal)}</SvgText>
          <SvgText x={0} y={MINI_CHART_HEIGHT - MC_PAD_BOTTOM} fontSize={9} fill={theme.textSoft}>{Math.round(minVal)}</SvgText>
          <Polyline points={points} fill="none" stroke={ink} strokeWidth={2.5} />
          <Polyline points={points} fill="none" stroke={chartLineColor} strokeWidth={1.5} />
        </Svg>
      )}
      <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 4 }}>{summaryText}</Text>
    </View>
  );
}

// ─── MealsEmptyState ──────────────────────────────────────────────────────────

export function MealsEmptyState({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: 48 }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: theme.coral.tint,
        borderWidth: 1.5, borderColor: theme.coral.solid + "40",
        alignItems: "center", justifyContent: "center",
      }}>
        <Ionicons name="restaurant-outline" size={34} color={theme.coral.solid} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: theme.textStrong, marginTop: 16 }}>Nothing logged yet today</Text>
      <Text style={{ fontSize: 13, color: theme.textSoft, marginTop: 6, textAlign: "center", maxWidth: 240 }}>
        Add your first meal to start tracking how food affects your day
      </Text>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); onPress(); }}
        style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22, borderWidth: 2, borderColor: theme.ink, backgroundColor: theme.coral.solid }}
        accessibilityRole="button"
      >
        <Text style={{ fontWeight: "700", color: onSolid(theme.coral.solid) }}>Log first meal</Text>
      </Pressable>
    </View>
  );
}

// ─── MacroDonut ───────────────────────────────────────────────────────────────

export type MacroDonutProps = {
  carbs: number | null;
  sugar: number | null;
  caffeine: number | null;
  calories: number | null;
  carbColor: string;
  sugarColor: string;
  caffeineColor: string;
};

export function MacroDonut({ carbs, sugar, caffeine, calories, carbColor, sugarColor, caffeineColor }: MacroDonutProps) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { theme } = useTheme();

  const SIZE = 120;
  const STROKE = 14;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const c = carbs ?? 0;
  const s = sugar ?? 0;
  const f = caffeine ?? 0;
  const total = c + s + f;

  const carbArc  = total > 0 ? (c / total) * CIRC : 0;
  const sugarArc = total > 0 ? (s / total) * CIRC : 0;
  const cafArc   = total > 0 ? (f / total) * CIRC : 0;

  const carbOffset  = 0;
  const sugarOffset = -(carbArc);
  const cafOffset   = -(carbArc + sugarArc);

  const hasData = total > 0;

  const macros = [
    { label: "Carbs",    value: c,  unit: "g",  pct: total > 0 ? Math.round((c / total) * 100) : 0, color: carbColor,     dasharray: `${carbArc} ${CIRC}`,  offset: CIRC * 0.25 + carbOffset },
    { label: "Sugar",    value: s,  unit: "g",  pct: total > 0 ? Math.round((s / total) * 100) : 0, color: sugarColor,    dasharray: `${sugarArc} ${CIRC}`, offset: CIRC * 0.25 + sugarOffset },
    { label: "Caffeine", value: f,  unit: "mg", pct: total > 0 ? Math.round((f / total) * 100) : 0, color: caffeineColor, dasharray: `${cafArc} ${CIRC}`,   offset: CIRC * 0.25 + cafOffset },
  ];

  return (
    <View style={{ alignItems: "center" }}>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); setShowBreakdown(v => !v); }}
        accessibilityRole="button"
        accessibilityLabel={`Macro breakdown donut${calories != null ? `, ${calories} calories` : ""}${c > 0 ? `, ${c}g carbs` : ""}${s > 0 ? `, ${s}g sugar` : ""}${f > 0 ? `, ${f}mg caffeine` : ""}. Tap to toggle breakdown.`}
      >
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={cx} cy={cy} r={R} stroke={theme.cardBorder} strokeWidth={STROKE} fill="none" />
          {hasData ? macros.map((m, i) => (
            <Circle
              key={i} cx={cx} cy={cy} r={R}
              stroke={m.color} strokeWidth={STROKE} fill="none"
              strokeDasharray={m.dasharray} strokeDashoffset={m.offset}
              strokeLinecap="butt" rotation={-90} origin={`${cx},${cy}`}
            />
          )) : null}
        </Svg>
        <View style={{ position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
          {calories !== null ? (
            <>
              <Text style={{ fontSize: 18, fontWeight: "900", color: theme.textStrong, lineHeight: 20 }}>{calories}</Text>
              <Text style={{ fontSize: 9, fontWeight: "800", color: theme.textSoft, letterSpacing: 0.4 }}>CAL</Text>
            </>
          ) : (
            <Text style={{ fontSize: 10, fontWeight: "800", color: theme.textSoft }}>TAP</Text>
          )}
        </View>
      </Pressable>
      {showBreakdown && (
        <View style={{ marginTop: 8, gap: 3, alignItems: "flex-start" }}>
          {macros.filter(m => m.value > 0).map(m => (
            <View key={m.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: m.color }} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: theme.textStrong }}>{m.label}</Text>
              <Text style={{ fontSize: 12, color: theme.textSoft }}>{m.value}{m.unit}</Text>
              <Text style={{ fontSize: 11, color: m.color, fontWeight: "700" }}>{m.pct}%</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
