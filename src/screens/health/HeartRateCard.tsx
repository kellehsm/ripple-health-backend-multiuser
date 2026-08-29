/**
 * health/HeartRateCard.tsx
 * Heart rate chart card.
 * Extracted from HealthScreen.tsx — no logic changes.
 */
import React, { useMemo } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import Svg, { Line } from "react-native-svg";
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

export const HeartRateCard = React.memo(function HeartRateCard({
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
  const usableW = CHART_WIDTH - PAD_LEFT;
  const usableH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const hrPointCoords = useMemo(() => {
    const hrNow = Date.now();
    const hrWindowStart = hrNow - hrRangeHours * 60 * 60 * 1000;
    const hrWindowMs = hrRangeHours * 60 * 60 * 1000;
    return hrReadings.map(function (r) {
      const t = new Date(r.recorded_at).getTime();
      const x = PAD_LEFT + ((t - hrWindowStart) / hrWindowMs) * usableW;
      const y = PAD_TOP + usableH - ((r.bpm - hrMin) / hrRange) * usableH;
      return { x, y, bpm: r.bpm };
    });
  }, [hrReadings, hrRangeHours, usableW, usableH, hrMin, hrRange]);

  const restingBpm = hrValues.length ? Math.min(...hrValues) : null;
  const peakBpm = hrValues.length ? Math.max(...hrValues) : null;
  const hr7DayValues = hr7DayReadings.map(function (r) { return r.bpm; });
  const hr7DayAvg = hr7DayValues.length > 0
    ? hr7DayValues.reduce(function (s, v) { return s + v; }, 0) / hr7DayValues.length
    : null;
  const hrTrendArrow = restingBpm !== null && hr7DayAvg !== null
    ? (restingBpm - hr7DayAvg > 3
        ? { symbol: "↑", dir: "up" as const }
        : restingBpm - hr7DayAvg < -3
          ? { symbol: "↓", dir: "down" as const }
          : { symbol: "→", dir: "stable" as const })
    : null;

  const coralTheme = (theme as any).coral as { solid: string; bg: string; sub: string; fg: string; tint: string } | undefined;

  const restingBadgeStyle = useMemo(() => {
    if (restingBpm !== null && restingBpm > 90) {
      return {
        bg: coralTheme?.tint ?? theme.red.tint,
        border: coralTheme?.sub ?? theme.red.sub,
        text: coralTheme?.fg ?? theme.red.fg,
      };
    }
    if (hrTrendArrow?.dir === "up") {
      return { bg: theme.amber.bg, border: theme.amber.sub, text: theme.amber.fg };
    }
    return { bg: theme.teal.bg, border: theme.teal.sub, text: theme.teal.fg };
  }, [restingBpm, hrTrendArrow, theme, coralTheme]);

  const zoneColor = (bpm: number): string => {
    if (bpm < 60) return theme.teal.solid;
    if (bpm < 100) return theme.amber.solid;
    if (bpm < 140) return coralTheme?.solid ?? "#FF6B35";
    return theme.danger;
  };

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
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 10,
              borderWidth: 1,
              backgroundColor: restingBadgeStyle.bg,
              borderColor: restingBadgeStyle.border,
            }}>
              <Text style={{ color: restingBadgeStyle.text, fontSize: 12 }}>
                Resting: {restingBpm} bpm
              </Text>
              {hrTrendArrow !== null && (
                <Text style={{ fontSize: 13, fontWeight: "800", color: restingBadgeStyle.text }}>
                  {hrTrendArrow.symbol}
                </Text>
              )}
            </View>
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
          <Svg
            width={CHART_WIDTH}
            height={CHART_HEIGHT}
            style={{ marginTop: 12 }}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Heart rate sparkline, latest ${restingBpm !== null ? restingBpm : "--"} bpm`}
          >
            {hrPointCoords.length > 1 && hrPointCoords.slice(0, -1).map((pt, i) => {
              const next = hrPointCoords[i + 1];
              const midBpm = (pt.bpm + next.bpm) / 2;
              const color = zoneColor(midBpm);
              return (
                <React.Fragment key={i}>
                  <Line x1={pt.x} y1={pt.y} x2={next.x} y2={next.y} stroke={ink} strokeWidth={3.5} strokeLinecap="round" />
                  <Line x1={pt.x} y1={pt.y} x2={next.x} y2={next.y} stroke={color} strokeWidth={2} strokeLinecap="round" />
                </React.Fragment>
              );
            })}
          </Svg>
        )}
        <CardLoadingOverlay loading={hrLoading || refreshing} size="small" />
      </ShadowCard>
    </Animated.View>
  );
});
