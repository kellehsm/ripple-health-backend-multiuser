import React from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeContext";
import { layeredShadow } from "../theme/styleUtils";
import { usePressScale } from "../hooks/usePressScale";

type Props = {
  value: number;
  options: readonly number[];
  onChange: (hours: number) => void;
  suffix?: string; // default "H"
  label?: string;   // accessibility prefix ("Glucose range", "Heart rate range")
};

export function RangeSelector({ value, options, onChange, suffix = "H", label = "Range" }: Props) {
  const { theme } = useTheme();
  const isDark = !!theme.isDark;
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((hrs) => (
        <RangeButton
          key={hrs}
          hrs={hrs}
          active={value === hrs}
          suffix={suffix}
          label={label}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(hrs);
          }}
          theme={theme}
          isDark={isDark}
        />
      ))}
    </View>
  );
}

function RangeButton({
  hrs, active, suffix, label, onPress, theme, isDark,
}: {
  hrs: number;
  active: boolean;
  suffix: string;
  label: string;
  onPress: () => void;
  theme: any;
  isDark: boolean;
}) {
  const ink = theme.ink;
  const card = theme.card;
  const { scale, onPressIn, onPressOut } = usePressScale("button");
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${hrs} ${suffix === "H" ? "hours" : suffix}`}
        accessibilityState={{ selected: active }}
        style={[
          styles.btn,
          { borderColor: ink, backgroundColor: active ? ink : card, ...layeredShadow("card", isDark) },
        ]}
      >
        <Text style={[styles.text, { color: active ? "#ffffff" : ink }]}>{hrs}{suffix}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  text: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
});
