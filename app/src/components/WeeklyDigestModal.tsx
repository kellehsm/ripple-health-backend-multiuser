import React from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { moodScoreEmoji } from "../theme/iconRegistry";

function weekGlucoseAvg(
  byTod: Partial<Record<string, { avg: number; count: number }>> | undefined
): number | null {
  if (!byTod) return null;
  const entries = Object.values(byTod).filter(Boolean) as { avg: number; count: number }[];
  if (!entries.length) return null;
  const totalWeight = entries.reduce((s, e) => s + e.count, 0);
  if (!totalWeight) return null;
  const weighted = entries.reduce((s, e) => s + e.avg * e.count, 0);
  return Math.round(weighted / totalWeight);
}

interface WeeklyDigestModalProps {
  visible: boolean;
  onClose: () => void;
  digest: any;
  theme: any;
}

export function WeeklyDigestModal({
  visible,
  onClose,
  digest,
  theme,
}: WeeklyDigestModalProps) {
  if (!digest) return null;

  const moodAvg: number | null = digest.mood?.avg_this_week ?? null;
  const stepsTotal: number = digest.steps?.this_week ?? 0;
  const sleepAvgSecs: number = digest.sleep?.seven_day_average_seconds ?? 0;
  const sleepAvgHrs: number | null =
    sleepAvgSecs > 0 ? Math.round((sleepAvgSecs / 3600) * 10) / 10 : null;
  const glucoseAvg = weekGlucoseAvg(digest.glucose_by_tod);

  const cards = [
    {
      icon: "flame-outline" as const,
      value: glucoseAvg !== null ? `${glucoseAvg}` : "--",
      label: "Avg Glucose",
      unit: glucoseAvg !== null ? "mg/dL" : "",
      color: theme.berry?.solid ?? theme.primary,
      bg: theme.berry?.tint ?? theme.card,
      fg: theme.berry?.fg ?? theme.textStrong,
    },
    {
      icon: "happy-outline" as const,
      value:
        moodAvg !== null
          ? `${moodScoreEmoji(Math.round(moodAvg))} ${moodAvg.toFixed(1)}`
          : "--",
      label: "Avg Mood",
      unit: moodAvg !== null ? "/ 5" : "",
      color: theme.violet?.solid ?? theme.primary,
      bg: theme.violet?.tint ?? theme.card,
      fg: theme.violet?.fg ?? theme.textStrong,
    },
    {
      icon: "footsteps-outline" as const,
      value: stepsTotal > 0 ? stepsTotal.toLocaleString() : "--",
      label: "Total Steps",
      unit: "",
      color: theme.teal?.solid ?? theme.primary,
      bg: theme.teal?.tint ?? theme.card,
      fg: theme.teal?.fg ?? theme.textStrong,
    },
    {
      icon: "moon-outline" as const,
      value: sleepAvgHrs !== null ? `${sleepAvgHrs}` : "--",
      label: "Avg Sleep",
      unit: sleepAvgHrs !== null ? "hrs/night" : "",
      color: theme.amber?.solid ?? theme.primary,
      bg: theme.amber?.tint ?? theme.card,
      fg: theme.amber?.fg ?? theme.textStrong,
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.page }]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: theme.cardBorder },
          ]}
        >
          <Text style={[styles.title, { color: theme.textStrong }]}>
            Your Week
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="Close weekly digest"
            style={[styles.closeBtn, { borderColor: theme.ink }]}
          >
            <Ionicons name="close" size={18} color={theme.ink} />
          </Pressable>
        </View>

        {/* 2×2 Grid */}
        <View style={styles.grid}>
          {cards.map((card, i) => (
            <View
              key={i}
              style={[
                styles.statCard,
                {
                  backgroundColor: card.bg,
                  borderColor: theme.cardBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.iconCircle,
                  { backgroundColor: card.color },
                ]}
              >
                <Ionicons name={card.icon} size={20} color="#fff" />
              </View>
              <Text
                style={[styles.statValue, { color: card.fg }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {card.value}
              </Text>
              {card.unit ? (
                <Text style={[styles.statUnit, { color: card.fg }]}>
                  {card.unit}
                </Text>
              ) : null}
              <Text style={[styles.statLabel, { color: theme.textSoft }]}>
                {card.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Footer CTA */}
        <Pressable
          onPress={onClose}
          style={[
            styles.cta,
            { backgroundColor: theme.primary ?? theme.teal?.solid },
          ]}
          accessibilityRole="button"
        >
          <Text style={[styles.ctaText, { color: "#fff" }]}>
            See full insights →
          </Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 16,
    gap: 12,
  },
  statCard: {
    width: "47%",
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center",
  },
  statUnit: {
    fontSize: 11,
    fontWeight: "600",
    opacity: 0.7,
    textAlign: "center",
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  cta: {
    margin: 20,
    marginTop: 0,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
