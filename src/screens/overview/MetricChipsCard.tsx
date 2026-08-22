/**
 * overview/MetricChipsCard.tsx
 * The 6-chip metric grid (Glucose, Steps, Sleep, Water, Meals, Mood).
 * Extracted from OverviewScreen.tsx — no logic changes.
 */
import React, { useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../theme/ThemeContext";
import { onSolid } from "../../theme/colorUtils";
import { coloredShadow } from "../../theme/styleUtils";
import { FONT_SIZES } from "../../theme/tokens";
import { ThemedIcon, moodScoreEmoji } from "../../theme/iconRegistry";
import { ThemedSurface } from "../../theme/pageTemplates";
import { Ionicons } from "@expo/vector-icons";
import { type QuickLogKind } from "../../components/QuickLogSheet";
import {
  AnimatedChip,
  AnimatedCounterText,
  SkeletonBox,
  WaterDroplet,
  CHIP_W,
  WATER_GOAL,
  type ChipData,
} from "./shared";

interface Props {
  loading: boolean;
  chips: ChipData[];
  stepsCount: number | null;
  waterCount: number;
  glucoseStatus: { hasData: boolean; mg_dl: number | null; arrow: string | null } | null;
  stepsCounterAnim: Animated.Value;
  waterCounterAnim: Animated.Value;
  glucoseCounterAnim: Animated.Value;
  chipAnims: React.MutableRefObject<Animated.Value[]>;
  moodScaleAnim: Animated.Value;
  tourChipsRef: React.RefObject<View | null>;
  onQuickLog: (kind: QuickLogKind) => void;
}

export function MetricChipsCard({
  loading,
  chips,
  stepsCount,
  waterCount,
  glucoseStatus,
  stepsCounterAnim,
  waterCounterAnim,
  glucoseCounterAnim,
  chipAnims,
  moodScaleAnim,
  tourChipsRef,
  onQuickLog,
}: Props) {
  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {[1,2,3,4,5,6].map(i => <SkeletonBox key={i} style={{ width: CHIP_W, height: 84 }} />)}
      </View>
    );
  }

  return (
    <View>
      <View ref={tourChipsRef} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityLabel="Key metrics">
        {chips.map((chip, index) => {
          const isSteps = chip.label === "STEPS" && stepsCount !== null && stepsCount > 0;
          const isWater = chip.label === "WATER" && waterCount > 0;
          const isGlucose = chip.label === "GLUCOSE" && !!glucoseStatus?.hasData && glucoseStatus.mg_dl != null;
          const animValue = isSteps ? stepsCounterAnim : isWater ? waterCounterAnim : isGlucose ? glucoseCounterAnim : null;
          const realNum  = isSteps ? stepsCount! : isWater ? waterCount : isGlucose ? glucoseStatus!.mg_dl! : 0;
          const glucoseArrow = isGlucose && glucoseStatus?.arrow ? " " + glucoseStatus.arrow : "";
          const entranceAnim = chipAnims.current[index] ?? new Animated.Value(1);
          return (
            <AnimatedChip
              key={chip.label}
              entranceAnim={entranceAnim}
              onPress={chip.onPress}
              onLongPress={chip.quickLog ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onQuickLog(chip.quickLog!); } : undefined}
              chipWidth={CHIP_W}
              dimmed={chip.empty}
              style={[chipStyle(theme), { overflow: "hidden" }]}
              accessibilityLabel={chip.label + ": " + chip.value}
              accessibilityRole={chip.onPress ? "button" : undefined}
            >
              {chip.tileId && (
                <ThemedSurface elementId={chip.tileId} kind="tile" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} imageOpacity={0.85} />
              )}
              <LinearGradient
                colors={[chip.color + "24", chip.color + "00"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                pointerEvents="none"
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              />
              <View style={[styles.chipIcon, { backgroundColor: chip.color }]}>
                {chip.slot ? (
                  <ThemedIcon slot={chip.slot} size={19} color={onSolid(chip.color)} />
                ) : (
                  <Ionicons name={chip.icon as any} size={19} color={onSolid(chip.color)} />
                )}
              </View>
              {chip.label === "WATER" && waterCount > 0 ? (
                <WaterDroplet count={waterCount} fillPct={Math.min(waterCount / WATER_GOAL, 1)} color={chip.color} />
              ) : chip.label === "MOOD" && !chip.empty ? (
                <Animated.View style={{ transform: [{ scale: moodScaleAnim }] }}>
                  <Text style={[styles.chipValue, { color: theme.textStrong }]} numberOfLines={1}>{chip.value}</Text>
                </Animated.View>
              ) : animValue ? (
                <AnimatedCounterText
                  animValue={animValue}
                  targetValue={realNum}
                  style={[styles.chipValue, { color: theme.textStrong }]}
                  format={isSteps ? (v) => v.toLocaleString() : isGlucose ? (v) => String(v) + glucoseArrow : undefined}
                />
              ) : (
                <Text style={[styles.chipValue, { color: theme.textStrong }]} numberOfLines={1}>{chip.value}</Text>
              )}
              {chip.label !== "WATER" && chip.sub ? <Text style={[styles.chipSub, { color: theme.textSoft }]} numberOfLines={1}>{chip.sub}</Text> : null}
              <Text style={[styles.chipLabel, { color: theme.textSoft }]}>{chip.label}</Text>
            </AnimatedChip>
          );
        })}
      </View>
    </View>
  );
}

function chipStyle(theme: any) {
  return {
    borderRadius: 22,
    borderWidth: 2,
    padding: 10,
    backgroundColor: theme.card,
    ...coloredShadow(theme.teal.solid, 0.8),
  };
}

const styles = StyleSheet.create({
  chipIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  chipValue: { fontSize: FONT_SIZES.heading, fontWeight: "900", lineHeight: 24, marginBottom: 1 },
  chipSub: { fontSize: FONT_SIZES.micro, lineHeight: 14, fontWeight: "600" },
  chipLabel: { fontSize: FONT_SIZES.micro, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, textTransform: "uppercase" },
});
