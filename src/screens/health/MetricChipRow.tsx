/**
 * health/MetricChipRow.tsx
 * The 2×3 metric chip grid (Glucose, Steps, Sleep, Water, Heart, Mind).
 * Extracted from HealthScreen.tsx — no logic changes.
 */
import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Pressable, Image, Easing } from "react-native";
import type { Theme } from "../../theme/theme";
import Svg, { Polyline, Rect } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { onSolid } from "../../theme/colorUtils";
import { useTheme } from "../../theme/ThemeContext";
import { MetricChip, MetricChipSkeleton, chipStyles } from "../../components/MetricChip";
import { getMetricPalette } from "../../lib/metricColors";
import { ThemedIcon } from "../../theme/iconRegistry";
import { AnimatedProgressRing } from "../../components/AnimatedProgressRing";
import { toast } from "../../lib/toast";
import { CHIP_GAP, PopText, StepsRing, MiniDroplet, type GlucoseStatus, type HRReading } from "./healthScreenShared";

function MindfulnessSidePanel({ theme }: { theme: Theme }) {
  const isCatTheme = theme.id === "cozy-cat";
  const catImage = require("../../../assets/themes/cat/greeting_morning.png");

  return (
    <View style={{ width: 72, alignItems: "center", justifyContent: "center" }}>
      {isCatTheme ? (
        <Image
          source={catImage}
          style={{ width: 68, height: 68 }}
          resizeMode="contain"
        />
      ) : (
        <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: theme.purple.tint, opacity: 0.5 }} />
      )}
    </View>
  );
}

interface Props {
  chipEntranceAnim: Animated.Value;
  chipsHydrated: boolean;
  status: GlucoseStatus | null;
  tirPct: number | null;
  stepsCount: number | null;
  stepGoal: number;
  stepsMetricId: string | null;
  weekStepsStart: number;
  stepsWeekTotal: number | null;
  stepsWeekDays?: { date: string; count: number }[];
  sleepScore: number | null;
  sleepWeekDays: { date: string; seconds: number }[];
  sleepDisplay: string | null;
  waterCount: number | null;
  waterGoal: number;
  waterFlashAnim: Animated.Value;
  waterCelebAnim: Animated.Value;
  waterCountScaleAnim: Animated.Value;
  hrReadings: HRReading[];
  mindStats: { streak: number; week_minutes: number; total_sessions: number } | null;
  onLogWater: () => void;
  navigation: any;
}

export function MetricChipRow({
  chipEntranceAnim,
  chipsHydrated,
  status,
  tirPct,
  stepsCount,
  stepGoal,
  stepsMetricId,
  weekStepsStart,
  stepsWeekTotal,
  stepsWeekDays = [],
  sleepScore,
  sleepWeekDays,
  sleepDisplay,
  waterCount,
  waterGoal,
  waterFlashAnim,
  waterCelebAnim,
  waterCountScaleAnim,
  hrReadings,
  mindStats,
  onLogWater,
  navigation,
}: Props) {
  const { theme } = useTheme();

  // Change 8 — Animated droplet fill
  const dropletFill = useRef(new Animated.Value((waterCount ?? 0) / Math.max(1, waterGoal))).current;
  useEffect(() => {
    Animated.timing(dropletFill, {
      toValue: (waterCount ?? 0) / Math.max(1, waterGoal),
      duration: 400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [waterCount, waterGoal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Change 10 — PB badge for Steps chip
  const pbScale = useRef(new Animated.Value(0)).current;
  const pbFiredRef = useRef(false);
  const today = new Date().toISOString().slice(0, 10);
  const todaySteps = stepsWeekDays.find(d => d.date === today)?.count ?? (stepsCount ?? 0);
  const isPB =
    stepsCount !== null &&
    stepsCount > 0 &&
    stepsWeekDays.length > 0 &&
    stepsWeekDays.every(d => d.date === today || d.count <= todaySteps);
  useEffect(() => {
    if (isPB && !pbFiredRef.current) {
      pbFiredRef.current = true;
      pbScale.setValue(0);
      Animated.sequence([
        Animated.timing(pbScale, { toValue: 1.2, duration: 200, useNativeDriver: true }),
        Animated.timing(pbScale, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
    if (!isPB) pbFiredRef.current = false;
  }, [isPB]); // eslint-disable-line react-hooks/exhaustive-deps

  const hrLast = hrReadings.length > 0 ? hrReadings[hrReadings.length - 1].bpm : null;
  const berryFg = (theme as any).berry?.fg ?? "#7A1F3C";
  const berrySub = (theme as any).berry?.sub ?? "#A62A50";
  const berrySolid = (theme as any).berry?.solid ?? "#A62A50";
  const berryBg = (theme as any).berry?.bg ?? "#FAE0E4";
  const amberFg = (theme as any).amber?.fg ?? "#7A5600";
  const amberSub = (theme as any).amber?.sub ?? "#906808";
  const amberSolid = (theme as any).amber?.solid ?? "#B88820";
  const amberBg = (theme as any).amber?.bg ?? "#F8EEC8";
  const stepsLabel = stepsCount !== null
    ? (stepsCount >= 1000 ? (stepsCount / 1000).toFixed(1) + "k" : String(stepsCount))
    : "--";
  const goalLabel = stepGoal >= 1000 ? (stepGoal / 1000).toFixed(0) + "k" : String(stepGoal);
  const glucoseMgDl = status?.hasData ? (status.mg_dl ?? null) : null;
  const glucosePal = getMetricPalette("glucose", glucoseMgDl, theme as any);
  const glucoseValueText = status?.hasData
    ? (String(status.mg_dl) + (status.arrow ? " " + status.arrow : ""))
    : "--";

  return (
    <Animated.View style={{ opacity: chipEntranceAnim }}>
      {/* Mindfulness bar with single decorative cat on the left */}
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: CHIP_GAP }}>
        <MindfulnessSidePanel theme={theme as Theme} />
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.getParent()?.navigate("Mindfulness");
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Mindfulness hub"
          style={{
            flex: 1,
            marginLeft: 6,
            borderRadius: 26,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.15)",
            backgroundColor: theme.purple.solid,
            paddingVertical: 11,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            overflow: "hidden",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: onSolid(theme.purple.solid), fontSize: 16, fontWeight: "900", marginBottom: 1 }}>Mindfulness</Text>
            <Text style={{ color: onSolid(theme.purple.solid), fontSize: 12, opacity: 0.75 }}>
              {mindStats && (mindStats.streak > 0 || mindStats.week_minutes > 0)
                ? `${mindStats.streak} day streak · ${mindStats.week_minutes}m this week`
                : "Breathing · grounding · gratitude"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={onSolid(theme.purple.solid)} style={{ opacity: 0.85 }} />
        </Pressable>
      </View>

      {/* Top row: 3 chips */}
      <View style={{ flexDirection: "row", gap: CHIP_GAP }}>

        {/* GLUCOSE chip */}
        {!chipsHydrated && glucoseMgDl === null && !status?.hasData ? (
          <MetricChipSkeleton borderColor={glucosePal.border} backgroundColor={glucosePal.bg} />
        ) : (
        <MetricChip
          borderColor={glucosePal.border}
          backgroundColor={glucosePal.bg}
          label="GLUCOSE"
          accessibilityLabel={
            glucoseMgDl !== null
              ? `Glucose ${glucoseMgDl} milligrams per deciliter${tirPct !== null ? `, ${tirPct} percent in range` : ""}`
              : "Glucose, no data"
          }
          onPress={() => navigation.getParent()?.navigate("GlucoseDetail")}
        >
          <ThemedIcon slot="metric.glucose" size={44} color={glucosePal.fg} />
          <PopText value={glucoseValueText} style={[chipStyles.val, { color: glucosePal.fg }]} />
          {tirPct !== null && (
            <Text style={[chipStyles.sub, { color: glucosePal.fg }]} allowFontScaling maxFontSizeMultiplier={1.3}>
              {tirPct}% in range
            </Text>
          )}
        </MetricChip>
        )}

        {/* STEPS chip */}
        {!chipsHydrated && stepsCount === null ? (
          <MetricChipSkeleton borderColor={theme.teal.solid} backgroundColor={theme.teal.bg} />
        ) : (
        <View style={{ position: "relative" }}>
        <MetricChip
          borderColor={theme.teal.solid}
          backgroundColor={theme.teal.bg}
          label="STEPS"
          accessibilityLabel={
            stepsCount !== null
              ? `Steps ${stepsCount} of ${stepGoal} daily goal`
              : "Steps, loading"
          }
          onPress={() => {
            if (stepsMetricId) {
              navigation.getParent()?.navigate("StepsDetail", { metricId: stepsMetricId, weekStartDay: weekStepsStart });
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
              toast("Steps data is still loading — try again in a moment.");
            }
          }}
        >
          <StepsRing steps={stepsCount} goal={stepGoal} color={theme.teal.solid} sub={theme.teal.sub} />
          <PopText value={stepsLabel} style={[chipStyles.val, { color: theme.teal.fg }]} numberOfLines={1} />
          <Text style={[chipStyles.sub, { color: theme.teal.sub }]} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>of {goalLabel}</Text>
          {(function () {
            const BAR_W = 4, GAP = 2, MAX_H = 16;
            const totalW = 7 * BAR_W + 6 * GAP;
            if (stepsWeekDays.length === 0 && stepsWeekTotal === null) return null;
            const bars = Array.from({ length: 7 }, (_, i) => {
              const d = stepsWeekDays[i];
              return d ? Math.min(1, d.count / Math.max(1, stepGoal)) : 0;
            });
            return (
              <Svg width={totalW} height={MAX_H + 2}>
                {bars.map((pct, bi) => {
                  const h = Math.max(2, Math.round(pct * MAX_H));
                  const barColor = pct === 0 ? theme.cardBorder : theme.teal.solid;
                  return (
                    <Rect key={bi} x={bi * (BAR_W + GAP)} y={MAX_H - h + 2} width={BAR_W} height={h}
                      fill={barColor} opacity={pct > 0 ? 0.75 : 0.32} rx={1.5} />
                  );
                })}
              </Svg>
            );
          })()}
        </MetricChip>
        {/* Change 10 — PB badge */}
        {isPB && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: theme.teal.solid,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ scale: pbScale }],
            }}
          >
            <Text style={{ fontSize: 10 }}>🏆</Text>
          </Animated.View>
        )}
        </View>
        )}

        {/* SLEEP chip — collapsed: duration + score ring + 7-night bars */}
        {(function () {
          const scoreColor = sleepScore === null
            ? amberSolid
            : sleepScore >= 75 ? theme.success
            : sleepScore >= 50 ? theme.warning
            : theme.danger;
          const GOAL = 8 * 3600;
          const BAR_W = 4, GAP = 2;
          const MAX_H = 16;
          const bars = Array.from({ length: 7 }, (_, i) => {
            const dayEntry = sleepWeekDays[i];
            return dayEntry ? Math.min(1, dayEntry.seconds / GOAL) : 0;
          });
          const totalW = 7 * BAR_W + 6 * GAP;
          return (
            <MetricChip
              borderColor={amberSolid}
              backgroundColor={amberBg}
              label="SLEEP"
              accessibilityLabel={sleepDisplay
                ? `Sleep ${sleepDisplay} last night${sleepScore !== null ? ", score " + sleepScore : ""}. Tap to open sleep details.`
                : "Sleep, no data. Tap to open sleep details."}
              onPress={() => navigation.getParent()?.navigate("SleepDetail")}
            >
              {sleepScore !== null ? (
                <AnimatedProgressRing
                  size={36}
                  strokeWidth={3}
                  progress={sleepScore / 100}
                  color={scoreColor}
                  trackColor={amberBg}
                  duration={600}
                >
                  <Text style={{ fontSize: 9, fontWeight: "900", color: scoreColor }}>{sleepScore}</Text>
                </AnimatedProgressRing>
              ) : (
                <ThemedIcon slot="metric.sleep" size={44} color={amberSub} />
              )}
              {sleepDisplay ? (
                <Text style={[chipStyles.val, { color: amberFg }]} allowFontScaling maxFontSizeMultiplier={1.3}>{sleepDisplay}</Text>
              ) : (
                <Text style={[chipStyles.sub, { color: amberSub }]}>--</Text>
              )}
              {sleepWeekDays.length > 0 && (
                <Svg width={totalW} height={MAX_H + 2}>
                  {bars.map((pct, bi) => {
                    const h = Math.max(2, Math.round(pct * MAX_H));
                    const barColor = pct === 0 ? theme.cardBorder : amberSolid;
                    return (
                      <Rect key={bi} x={bi * (BAR_W + GAP)} y={MAX_H - h + 2} width={BAR_W} height={h}
                        fill={barColor} opacity={pct > 0 ? 0.75 : 0.32} rx={1.5} />
                    );
                  })}
                </Svg>
              )}
            </MetricChip>
          );
        })()}

      </View>

      {/* Bottom row: 2 chips, centered so each sits between the gaps of the top three */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: CHIP_GAP, marginTop: CHIP_GAP }}>

        {/* WATER chip — filling droplet shows progress, tap to log */}
        <MetricChip
          borderColor={theme.blue.solid}
          backgroundColor={theme.blue.bg}
          label="WATER"
          overflow="hidden"
          accessibilityLabel={`Water ${waterCount ?? 0} of ${waterGoal} glasses. Tap to log a glass, long press to open tracker.`}
          onPress={onLogWater}
          onLongPress={() => navigation.getParent()?.navigate("WaterDetail")}
        >
          <Animated.View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.blue.solid, opacity: waterFlashAnim, borderRadius: 11 }} pointerEvents="none" />
          {(theme as any).iconOverrides?.["metric.water"] ? (
            <ThemedIcon slot="metric.water" size={44} />
          ) : (
            <MiniDroplet count={waterCount ?? 0} goal={waterGoal} color={theme.blue.solid} animatedFillRatio={dropletFill} />
          )}
          <Animated.Text style={[chipStyles.sub, { color: theme.blue.sub, transform: [{ scale: waterCountScaleAnim }] }]}>
            {waterCount ?? 0}/{waterGoal}
          </Animated.Text>
          <Text style={{ fontSize: 9, fontWeight: "800", color: theme.blue.sub, opacity: 0.7, letterSpacing: 0.3 }}>hold for details</Text>
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
              alignItems: "center", justifyContent: "center",
              opacity: waterCelebAnim,
              transform: [{ scale: waterCelebAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.15, 1] }) }],
            }}
          >
            <ThemedIcon slot="health.water_block" size={22} />
            <Text style={{ fontSize: 9, fontWeight: "900", color: theme.blue.sub, letterSpacing: 0.5 }}>GOAL!</Text>
          </Animated.View>
        </MetricChip>

        {/* HEART RATE chip */}
        {!chipsHydrated && hrLast === null ? (
          <MetricChipSkeleton borderColor={berrySolid} backgroundColor={berryBg} />
        ) : (
        <MetricChip
          borderColor={berrySolid}
          backgroundColor={berryBg}
          label="HEART"
          accessibilityLabel={hrLast !== null ? `Heart rate ${hrLast} beats per minute` : "Heart rate, no data"}
          onPress={() => navigation.getParent()?.navigate("HeartRateDetail")}
        >
          {(function () {
            const recent = hrReadings.slice(-8);
            if (recent.length < 2) return null;
            const W = 74, H = 22;
            const bpms = recent.map(r => r.bpm);
            const min = Math.min(...bpms), max = Math.max(...bpms);
            const span = max - min || 1;
            const pts = bpms.map((b, i) =>
              `${((i / (bpms.length - 1)) * W).toFixed(1)},${(H - ((b - min) / span) * H).toFixed(1)}`
            ).join(" ");
            return (
              <View pointerEvents="none" style={{ position: "absolute", bottom: 6, left: 0, right: 0, alignItems: "center", opacity: 0.35 }}>
                <Svg width={W} height={H}>
                  <Polyline points={pts} fill="none" stroke={berrySub} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
                </Svg>
              </View>
            );
          })()}
          <ThemedIcon slot="metric.heart" size={44} color={berrySub} />
          <PopText value={hrLast !== null ? String(hrLast) : "--"} style={[chipStyles.val, { color: berryFg }]} />
          <Text style={[chipStyles.sub, { color: berrySub }]} allowFontScaling maxFontSizeMultiplier={1.3}>bpm</Text>
        </MetricChip>
        )}

      </View>
    </Animated.View>
  );
}
