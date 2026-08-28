import React from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ThemedIcon } from "../theme/iconRegistry";

export type QuickLogKind = "water" | "mood" | "steps" | "glucose" | "meals" | "sleep";

const MOODS: Array<{ slot: string; score: number; label: string }> = [
  { slot: "mood.1", score: 1, label: "Rough" },
  { slot: "mood.2", score: 2, label: "Low" },
  { slot: "mood.3", score: 3, label: "Okay" },
  { slot: "mood.4", score: 4, label: "Good" },
  { slot: "mood.5", score: 5, label: "Great" },
];

export function QuickLogSheet({ visible, kind, onClose, onLogWater, onLogMood, onOpenDetail }: {
  visible: boolean;
  kind: QuickLogKind | null;
  onClose: () => void;
  onLogWater: () => void;
  onLogMood: (score: number, label: string) => void;
  onOpenDetail: (kind: QuickLogKind) => void;
}) {
  const { theme } = useTheme();
  if (!kind) return null;

  function body() {
    switch (kind) {
      case "water":
        return (
          <Pressable
            onPress={() => { onLogWater(); onClose(); }}
            style={[styles.actionBtn, { backgroundColor: theme.blue.solid }]}
            accessibilityRole="button"
            accessibilityLabel="Log one glass of water"
          >
            <Ionicons name="water" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>+1 Glass</Text>
          </Pressable>
        );
      case "mood":
        return (
          <View style={styles.moodRow}>
            {MOODS.map(m => (
              <Pressable
                key={m.score}
                onPress={() => { onLogMood(m.score, m.label); onClose(); }}
                style={[styles.moodBtn, { backgroundColor: theme.violet.solid + "14", borderColor: theme.violet.solid + "40" }]}
                accessibilityRole="button"
                accessibilityLabel={`Log mood ${m.label}`}
              >
                <ThemedIcon slot={m.slot} size={26} />
                <Text style={[styles.moodLabel, { color: theme.textSoft }]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        );
      default:
        return (
          <Pressable
            onPress={() => { onClose(); onOpenDetail(kind!); }}
            style={[styles.actionBtn, { backgroundColor: theme.teal.solid }]}
            accessibilityRole="button"
            accessibilityLabel="Open details"
          >
            <Ionicons name={kind === "meals" ? "restaurant" : "open-outline"} size={18} color="#fff" />
            <Text style={styles.actionBtnText}>{kind === "meals" ? "Log a meal" : "Open details"}</Text>
          </Pressable>
        );
    }
  }

  const TITLES: Record<QuickLogKind, string> = {
    water: "Quick log water",
    mood: "How are you feeling?",
    steps: "Steps",
    glucose: "Glucose",
    meals: "Meals",
    sleep: "Sleep",
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]} onPress={() => {}} accessibilityViewIsModal={true}>
          <View style={[styles.handle, { backgroundColor: theme.cardBorder }]} />
          <Text style={[styles.title, { color: theme.textStrong }]}>{TITLES[kind]}</Text>
          {body()}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, padding: 20, paddingBottom: 32, alignItems: "center" },
  handle: { width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: "800", marginBottom: 16 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 14 },
  actionBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  moodRow: { flexDirection: "row", gap: 8 },
  moodBtn: { alignItems: "center", padding: 10, borderRadius: 14, borderWidth: 1, minWidth: 58 },
  moodLabel: { fontSize: 10, fontWeight: "700", marginTop: 2 },
});
