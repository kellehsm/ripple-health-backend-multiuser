import React, { ReactNode } from "react";
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { layeredShadow } from "../theme/styleUtils";
import { CyclingImage } from "./CyclingImage";

type ExerciseData = {
  name: string;
  images?: string[];
  primary_muscles?: string[];
  category?: string;
  equipment?: string;
};

type Variant =
  | "row"        // Small horizontal card with 72×72 thumb — used in queues / search results
  | "hero"       // Large 220px image on top, meta below — program-day preview
  | "compact";   // Medium horizontal card — used in session logged entries + history

type Props = {
  exercise: ExerciseData;
  variant?: Variant;
  onPress?: () => void;
  right?: ReactNode;           // trailing content (rep target chip, PR badge, chevron)
  bottomAccent?: ReactNode;    // content rendered below the meta block inside the card
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function ExerciseCard({
  exercise, variant = "compact", onPress, right, bottomAccent,
  accessibilityLabel, accessibilityHint, style,
}: Props) {
  const { theme } = useTheme();
  const isDark = !!theme.isDark;
  const ink = theme.ink;
  const musclesText = (exercise.primary_muscles ?? []).slice(0, 3).join(", ");
  const catLine = [exercise.category, exercise.equipment, musclesText].filter(Boolean).join(" · ");

  if (variant === "hero") {
    return (
      <Wrapper onPress={onPress} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
        style={[styles.hero, { backgroundColor: theme.card, borderColor: ink, ...layeredShadow("card", isDark) }, style]}>
        <CyclingImage images={exercise.images ?? []} style={{ width: "100%", height: 220 }} />
        <View style={{ padding: 14, gap: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: "800", color: theme.textStrong }} allowFontScaling maxFontSizeMultiplier={1.3}>{exercise.name}</Text>
          {musclesText ? (
            <Text style={{ fontSize: 13, color: theme.textSoft, textTransform: "capitalize" }} allowFontScaling maxFontSizeMultiplier={1.3}>{musclesText}</Text>
          ) : null}
          {bottomAccent}
        </View>
        {right}
      </Wrapper>
    );
  }

  const thumbSize = variant === "row" ? 60 : 72;
  return (
    <Wrapper onPress={onPress} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
      style={[styles.rowCard, { backgroundColor: theme.card, borderColor: ink, ...layeredShadow("card", isDark) }, style]}>
      <CyclingImage images={exercise.images ?? []} style={{ width: thumbSize, height: thumbSize, borderRadius: 12 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: variant === "row" ? 14 : 16, fontWeight: "800", color: theme.textStrong }} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>
          {exercise.name}
        </Text>
        {catLine ? (
          <Text style={{ fontSize: 12, color: theme.textSoft, textTransform: "capitalize" }} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>
            {catLine}
          </Text>
        ) : null}
        {bottomAccent}
      </View>
      {right}
    </Wrapper>
  );
}

function Wrapper({ onPress, accessibilityLabel, accessibilityHint, children, style }: any) {
  if (!onPress) return <View style={style} accessibilityLabel={accessibilityLabel}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 22, borderWidth: 2, overflow: "hidden" },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 16,
    borderWidth: 2,
  },
});
