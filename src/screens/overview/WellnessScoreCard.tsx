/**
 * overview/WellnessScoreCard.tsx
 * The animated wellness score ring with sparkline history.
 * Extracted from OverviewScreen.tsx — no logic changes.
 */
import React from "react";
import { View, Text, Pressable } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { useTheme } from "../../theme/ThemeContext";
import { ShadowCard } from "../../components/ShadowCard";
import { DailySummaryData, scoreColor, scoreLabel } from "../../components/DailySummaryCard";
import { CountUpText } from "../../components/CountUpText";
import { AnimatedProgressRing } from "../../components/AnimatedProgressRing";
import { todayStr } from "../../utils/dateUtils";
import { FONT_SIZES } from "../../theme/tokens";

interface Props {
  dailySummary: DailySummaryData | null;
  wellnessHistory: { date: string; overall_score: number | null }[];
  onPress: () => void;
}

export function WellnessScoreCard({ dailySummary, wellnessHistory, onPress }: Props) {
  const { theme } = useTheme();
  const wsScores = dailySummary?.scores ?? null;
  const wsOverall = wsScores?.overall ?? null;
  const todayD = todayStr();
  const histPts = wellnessHistory
    .filter(h => h.overall_score !== null && h.date !== todayD)
    .map(h => h.overall_score as number);
  if (wsOverall !== null) histPts.push(wsOverall);
  const wsColor = scoreColor(wsOverall, theme);
  const SPARK_W = 120, SPARK_H = 36;
  const sparkPoints = histPts.length >= 2
    ? histPts.map((v, i) => {
        const x = (i / (histPts.length - 1)) * SPARK_W;
        const y = SPARK_H - (Math.min(Math.max(v, 0), 100) / 100) * SPARK_H;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")
    : null;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Wellness score details">
      <ShadowCard size="card" cardId="wellness_score">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <AnimatedProgressRing size={58} strokeWidth={4} progress={wsOverall !== null ? wsOverall / 100 : 0} color={wsColor} duration={500}>
              <CountUpText value={wsOverall} duration={450} fallback="--" style={{ fontSize: 22, fontWeight: "800", color: wsColor }} />
            </AnimatedProgressRing>
            <View>
              <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "900", letterSpacing: -0.5, color: theme.textStrong, marginBottom: 2 }}>Wellness score</Text>
              <Text style={{ fontSize: FONT_SIZES.caption, color: theme.textSoft }}>
                {wsOverall !== null ? scoreLabel(wsOverall) + " · tap for breakdown" : "No data yet today"}
              </Text>
            </View>
          </View>
          {sparkPoints ? (
            <Svg width={SPARK_W} height={SPARK_H}>
              <Polyline points={sparkPoints} fill="none" stroke={wsColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
          ) : null}
        </View>
      </ShadowCard>
    </Pressable>
  );
}
