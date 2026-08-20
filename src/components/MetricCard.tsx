import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { onSolid } from "../theme/colorUtils";
import { ShadowCard } from "./ShadowCard";

type ColorKey = "teal" | "blue" | "amber" | "coral" | "pink" | "green" | "red" | "berry" | "violet" | "purple";

type Props = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  colorKey: ColorKey;
  sublabel?: string;
  onAction?: () => void;
  // solid = saturated fill + white text; tint = light bg + colored dark text
  variant?: "solid" | "tint";
  /** When set, enables per-tile background theming via the premium theme system. */
  tileId?: string;
};

const NUMERIC_RE = /^[\d,.]+$/;

function useCountUp(value: string, duration = 600): string {
  const target = NUMERIC_RE.test(value) ? parseFloat(value.replace(/,/g, "")) : null;
  const animRef = useRef(new Animated.Value(0));
  const [display, setDisplay] = useState<string>(value);
  const doneRef = useRef(false);

  useEffect(() => {
    if (target === null) {
      setDisplay(value);
      return;
    }
    doneRef.current = false;
    animRef.current.setValue(0);
    setDisplay("0");
    const id = animRef.current.addListener(({ value: v }) => {
      if (!doneRef.current) setDisplay(String(Math.round(v)));
    });
    Animated.timing(animRef.current, {
      toValue: target,
      duration,
      useNativeDriver: false,
    }).start(() => {
      doneRef.current = true;
      animRef.current.removeListener(id);
      setDisplay(value);
    });
    return () => {
      animRef.current.removeListener(id);
    };
  }, [value]);

  return display;
}

export const MetricCard = React.memo(function MetricCard({ label, value, icon, colorKey, sublabel, onAction, variant = "tint", tileId }: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;
  const c = (theme as any)[colorKey];
  const displayValue = useCountUp(value);

  const bg = variant === "solid" ? c.solid : c.tint;
  const solidText = onSolid(c.solid);
  const solidSub = solidText === "#ffffff" ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.55)";
  const textColor = variant === "solid" ? solidText : c.fg;
  const subColor = variant === "solid" ? solidSub : c.sub;
  const iconColor = variant === "solid" ? solidText : c.fg;

  // Stat chip: border uses saturated accent color on light bg; white/transparent on solid fill
  const chipBorder = variant === "solid"
    ? (solidText === "#ffffff" ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)")
    : c.solid;
  const shadowTone = variant === "solid" ? c.solid : "rgba(60,40,20,0.1)";

  return (
    <ShadowCard size="tile" bg={bg} accent={c.solid} padding={10} style={{ flexGrow: 1, minWidth: 130 }} tileId={tileId}>
      <View style={styles.labelRow}>
        <Ionicons name={icon} size={11} color={iconColor} />
        <Text style={[styles.label, { color: subColor }]}>{label.toUpperCase()}</Text>
      </View>
      <Text style={[styles.value, { color: textColor }]}>{displayValue}</Text>
      {sublabel ? <Text style={[styles.sublabel, { color: subColor }]}>{sublabel}</Text> : null}
      {onAction ? (
        <Pressable
          onPress={onAction}
          style={[
            styles.actionButton,
            {
              backgroundColor: variant === "solid" ? (solidText === "#ffffff" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)") : theme.card,
              borderColor: variant === "solid" ? (solidText === "#ffffff" ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.3)") : c.solid,
              shadowColor: "rgba(60,40,20,0.08)",
            },
          ]}
        >
          <Ionicons name="add" size={11} color={variant === "solid" ? solidText : c.fg} />
          <Text style={[styles.actionLabel, { color: variant === "solid" ? solidText : c.fg }]}>+1</Text>
        </Pressable>
      ) : null}
    </ShadowCard>
  );
});

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  label: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  value: { fontSize: 22, fontWeight: "900" },
  sublabel: { fontSize: 11, marginTop: 4 },
  actionButton: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  actionLabel: { fontSize: 10, fontWeight: "800" },
});
