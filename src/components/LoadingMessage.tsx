import React, { useEffect, useState } from "react";
import { View, Text, StyleProp, ViewStyle, StyleSheet } from "react-native";
import { RippleLoader } from "./RippleLoader";
import { useTheme } from "../theme/ThemeContext";
import { useReduceMotion } from "../hooks/useReduceMotion";

const MESSAGES: Record<string, string[]> = {
  overview: [
    "Watching your patterns…",
    "Reading the ripples…",
    "Counting today's wins…",
  ],
  health: [
    "Checking the numbers…",
    "Reading your rhythm…",
    "Steadying the graph…",
  ],
  meals: [
    "Setting the table…",
    "Warming up the kitchen…",
    "Weighing today's plate…",
  ],
  finance: [
    "Balancing the ledger…",
    "Counting coins…",
    "Sorting receipts…",
  ],
  insights: [
    "Looking for patterns…",
    "Connecting the dots…",
    "Reading your last few weeks…",
  ],
  mindfulness: [
    "Steeping your tea…",
    "Settling in…",
    "One deep breath…",
  ],
  generic: [
    "Just a moment…",
    "Almost there…",
    "Loading…",
  ],
};

/**
 * Branded full-screen loader with a rotating themed message. Kind picks the
 * copy set; each render picks one at random. Respects Reduce Motion by
 * skipping the rotation and showing a single static message.
 */
export function LoadingMessage({
  kind = "generic",
  style,
}: {
  kind?: keyof typeof MESSAGES;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const reduce = useReduceMotion();
  const pool = MESSAGES[kind] ?? MESSAGES.generic;
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * pool.length));

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % pool.length), 2400);
    return () => clearInterval(t);
  }, [pool.length, reduce]);

  return (
    <View style={[styles.wrap, style]}>
      <RippleLoader size="large" />
      <Text style={[styles.msg, { color: theme.textSoft }]}>{pool[idx]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  msg: { fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },
});
