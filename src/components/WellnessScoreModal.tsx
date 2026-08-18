import React, { useEffect, useRef } from "react";
import { Modal, View, Text, Pressable, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { DOMAINS, scoreColor, scoreLabel, type DailySummaryScores } from "./DailySummaryCard";
import { isReducedMotion } from "../lib/motion";

function DomainBar({ label, value, color, anim, theme }: {
  label: string; value: number | null; color: string; anim: Animated.Value; theme: any;
}) {
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: theme.textSoft }]}>{label}</Text>
      <View style={[styles.barTrack, { backgroundColor: theme.cardBorder }]}>
        <Animated.View
          style={[styles.barFill, {
            backgroundColor: color,
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${value ?? 0}%`] }),
          }]}
        />
      </View>
      <Text style={[styles.barValue, { color: value !== null ? theme.textStrong : theme.textSoft }]}>
        {value !== null ? value : "--"}
      </Text>
    </View>
  );
}

export function WellnessScoreModal({ visible, onClose, scores, date }: {
  visible: boolean;
  onClose: () => void;
  scores: DailySummaryScores | null;
  date: string;
}) {
  const { theme } = useTheme();
  const anims = useRef(DOMAINS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) { anims.forEach(a => a.setValue(0)); return; }
    if (isReducedMotion()) { anims.forEach(a => a.setValue(1)); return; }
    Animated.stagger(50, anims.map(a =>
      Animated.timing(a, { toValue: 1, duration: 450, useNativeDriver: false })
    )).start();
  }, [visible]);

  const overall = scores?.overall ?? null;
  const overallColor = scoreColor(overall, theme);
  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]} onPress={() => {}}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: theme.textStrong }]}>Wellness Score</Text>
              <Text style={[styles.date, { color: theme.textSoft }]}>{dateLabel}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={theme.textSoft} />
            </Pressable>
          </View>

          <View style={styles.overallRow}>
            <View style={[styles.overallBadge, { backgroundColor: overallColor + "18", borderColor: overallColor }]}>
              <Text style={[styles.overallNumber, { color: overallColor }]}>{overall !== null ? overall : "--"}</Text>
              <Text style={[styles.overallLabel, { color: overallColor }]}>{scoreLabel(overall)}</Text>
            </View>
            <Text style={[styles.blurb, { color: theme.textSoft }]}>
              A blend of your tracked areas today — sleep, glucose, activity, water, meals, mood, productivity, and stress.
            </Text>
          </View>

          {DOMAINS.map((d, i) => (
            <DomainBar
              key={d.key}
              label={d.label}
              value={scores ? scores[d.key] : null}
              color={scoreColor(scores ? scores[d.key] : null, theme)}
              anim={anims[i]}
              theme={theme}
            />
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 34 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  title: { fontSize: 17, fontWeight: "800" },
  date: { fontSize: 12, marginTop: 2 },
  overallRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  overallBadge: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  overallNumber: { fontSize: 28, fontWeight: "800", lineHeight: 32 },
  overallLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5 },
  blurb: { flex: 1, fontSize: 12, lineHeight: 17 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  barLabel: { width: 82, fontSize: 11, fontWeight: "700" },
  barTrack: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  barValue: { width: 28, fontSize: 12, fontWeight: "700", textAlign: "right" },
});
