/**
 * health/HeartRateCard.tsx
 * Heart rate chart card.
 * Extracted from HealthScreen.tsx — no logic changes.
 */
import React from "react";
import { View, Text, Pressable, Animated } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { ShadowCard } from "../../components/ShadowCard";
import { RangeSelector } from "../../components/RangeSelector";
import { CardLoadingOverlay } from "../../components/CardLoadingOverlay";
import { useTheme } from "../../theme/ThemeContext";
import { CHART_WIDTH, CHART_HEIGHT, PAD_LEFT, PAD_TOP, PAD_BOTTOM, type HRReading } from "./healthScreenShared";

const HR_RANGE_OPTIONS = [3, 6, 12, 24];

interface Props {
  bottomCardsEntranceAnim: Animated.Value;
  hrReadings: HRReading[];
  hr7DayReadings: HRReading[];
  hrRangeHours: number;
  setHrRangeHours: (h: number) => void;
  hrLoading: boolean;
  refreshing: boolean;
  navigation: any;
  styles: any;
}

export function HeartRateCard({
  bottomCardsEntranceAnim,
  hrReadings,
  hr7DayReadings,
  hrRangeHours,
  setHrRangeHours,
  hrLoading,
  refreshing,
  navigation,
  styles,
}: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;

  const hrValues = hrReadings.map((r) => r.bpm);
  const hrMin = hrValues.length ? Math.min(...hrValues) - 5 : 40;
  const hrMax = hrValues.length ? Math.max(...hrValues) + 5 : 120;
  const hrRange = hrMax - hrMin || 1;
  const hrNow = Date.now();
  const hrWindowStart = hrNow - hrRangeHours * 60 * 60 * 1000;
  const hrWindowMs = hrRangeHours * 60 * 60 * 1000;
  const usableW = CHART_WIDTH - PAD_LEFT;
  const usableH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const hrPoints = hrReadings.map(function (r) {
    const t = new Date(r.recorded_at).getTime();
    const x = PAD_LEFT + ((t - hrWindowStart) / hrWindowMs) * usableW;
    const y = PAD_TOP + usableH - ((r.bpm - hrMin) / hrRange) * usableH;
    return x + "," + y;
  }).join(" ");
  const restingBpm = hrValues.length ? Math.min(...hrValues) : null;
  const peakBpm = hrValues.length ? Math.max(...hrValues) : null;
  const hr7DayValues = hr7DayReadings.map(function (r) { return r.bpm; });
  const hr7DayAvg = hr7DayValues.length > 0
    ? hr7DayValues.reduce(function (s, v) { return s + v; }, 0) / hr7DayValues.length
    : null;
  const hrTrendArrow = restingBpm !== null && hr7DayAvg !== null
    ? (restingBpm - hr7DayAvg > 3
        ? { symbol: "↑", color: theme.danger }
        : restingBpm - hr7DayAvg < -3
          ? { symbol: "↓", color: theme.success }
          : { symbol: "→", color: theme.textSoft })
    : null;

  return (
    <Animated.View style={{ opacity: bottomCardsEntranceAnim }}>
      <ShadowCard size="card" accent={theme.berry.solid} padding={14} cardId="heart_rate_card">
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">Heart Rate</Text>
          {peakBpm !== null ? (
            <View style={styles.peakBadge}>
              <Text style={styles.peakBadgeText}>{peakBpm} PEAK</Text>
            </View>
          ) : null}
        </View>
        {restingBpm !== null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <Text style={{ color: theme.textSoft, fontSize: 12 }}>
              Resting: {restingBpm} bpm
            </Text>
            {hrTrendArrow !== null && (
              <Text style={{ fontSize: 14, fontWeight: "800", color: hrTrendArrow.color }}>
                {hrTrendArrow.symbol}
              </Text>
            )}
          </View>
        ) : null}
        <View style={styles.rangeRow}>
          <RangeSelector
            value={hrRangeHours}
            options={HR_RANGE_OPTIONS}
            onChange={setHrRangeHours}
            label="Heart rate range"
          />
        </View>
        {hrLoading ? (
          <LoadingIndicator style={{ marginVertical: 30 }} />
        ) : hrReadings.length === 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: theme.textSoft, fontSize: 12 }}>
              No heart rate data in this window.
            </Text>
            <Pressable onPress={() => navigation.navigate("SettingsHealthConnect" as never)} hitSlop={6} style={{ marginTop: 6 }}>
              <Text style={{ color: theme.berry.solid, fontSize: 12, fontWeight: "800" }}>
                Sync from Health Connect →
              </Text>
            </Pressable>
          </View>
        ) : (
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT} style={{ marginTop: 12 }}>
            <Polyline points={hrPoints} fill="none" stroke={ink} strokeWidth={3.5} />
            <Polyline points={hrPoints} fill="none" stroke={theme.berry.sub} strokeWidth={2} />
          </Svg>
        )}
        <CardLoadingOverlay loading={hrLoading || refreshing} size="small" />
      </ShadowCard>
    </Animated.View>
  );
}
