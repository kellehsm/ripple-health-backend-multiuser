import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";

// ─── Body diagram (head → feet) ──────────────────────────────────────────────

export const BODY_DIAGRAM_ORDER = [
  { area: "face",      label: "Face",      emoji: "😌" },
  { area: "shoulders", label: "Shoulders", emoji: "💪" },
  { area: "arms",      label: "Arms",      emoji: "🤲" },
  { area: "abdomen",   label: "Abdomen",   emoji: "🫁" },
  { area: "thighs",    label: "Thighs",    emoji: "🦵" },
  { area: "calves",    label: "Calves",    emoji: "🦵" },
  { area: "feet",      label: "Feet",      emoji: "🦶" },
];

export function PmrBodyDiagram({ activeArea, accentColor }: { activeArea: string; accentColor: string }) {
  return (
    <View style={{ gap: 4, marginBottom: 8 }}>
      {BODY_DIAGRAM_ORDER.map((part) => {
        const isActive = part.area === activeArea;
        return (
          <View
            key={part.area}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: isActive ? 8 : 3,
              paddingHorizontal: 12,
              borderRadius: 12,
              backgroundColor: isActive ? accentColor + "22" : "transparent",
            }}
          >
            <Text style={{ fontSize: isActive ? 28 : 20, opacity: isActive ? 1 : 0.3, width: 36, textAlign: "center" }}>
              {part.emoji}
            </Text>
            <Text style={{
              fontSize: isActive ? 15 : 13,
              fontWeight: isActive ? "800" : "400",
              color: isActive ? accentColor : "#888",
              opacity: isActive ? 1 : 0.3,
              marginLeft: 8,
              flex: 1,
            }}>
              {part.label}
            </Text>
            {isActive && (
              <Text style={{ color: accentColor, fontSize: 16, fontWeight: "800" }}>◀</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Calm grace period countdown ─────────────────────────────────────────────

export function GraceCountdown({ count, accentColor, theme, ink }: {
  count: number | null; accentColor: string; theme: any; ink: string;
}) {
  return (
    <View style={{ alignItems: "center", gap: 18, paddingVertical: 32 }}>
      <Text style={{ color: theme.textSoft, fontSize: 15, letterSpacing: 0.5 }}>Get ready...</Text>
      {count !== null && (
        <View style={{
          width: 104, height: 104, borderRadius: 52,
          backgroundColor: theme.card,
          borderWidth: 2, borderColor: accentColor,
          alignItems: "center", justifyContent: "center",
          shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.1, shadowRadius: 12, elevation: 3,
        }}>
          <Text style={{ color: accentColor, fontSize: 48, fontWeight: "900" }}>{count}</Text>
        </View>
      )}
      <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: "center" }}>
        Find a comfortable position
      </Text>
    </View>
  );
}

// ─── Large circle start button ───────────────────────────────────────────────

export function StartCircleButton({ onPress, accentColor, ink, sublabel }: {
  onPress: () => void; accentColor: string; ink: string; sublabel?: string;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 28, gap: 14 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Start"
        style={{
          width: 160, height: 160, borderRadius: 80,
          backgroundColor: accentColor,
          borderWidth: 3, borderColor: ink,
          alignItems: "center", justifyContent: "center",
          shadowColor: "rgba(60,40,20,0.1)",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.18, shadowRadius: 20, elevation: 8,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900" }}>▶</Text>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800", letterSpacing: 2, marginTop: 6 }}>START</Text>
      </Pressable>
      {sublabel ? <Text style={{ color: ink, fontSize: 14, fontWeight: "700" }}>{sublabel}</Text> : null}
    </View>
  );
}

// ─── Mood delta picker (1-tap, 1–5) ──────────────────────────────────────────

const MOOD_FACES = ["😞", "😕", "😐", "🙂", "😄"];

export function MoodDeltaPicker({ label, value, onSelect, accentColor, theme }: {
  label: string;
  value: number | null;
  onSelect: (v: number) => void;
  accentColor: string;
  theme: any;
}) {
  return (
    <View style={{ alignItems: "center", gap: 8 }}>
      <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: "800", letterSpacing: 0.6 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {MOOD_FACES.map((face, i) => {
          const v = i + 1;
          const selected = value === v;
          return (
            <Pressable
              key={v}
              onPress={() => { Haptics.selectionAsync(); onSelect(v); }}
              accessibilityRole="button"
              accessibilityLabel={`Mood ${v} of 5`}
              style={{
                width: 46, height: 46, borderRadius: 23,
                alignItems: "center", justifyContent: "center",
                borderWidth: 2,
                borderColor: selected ? accentColor : "rgba(150,150,150,0.3)",
                backgroundColor: selected ? accentColor + "26" : theme.card,
                transform: [{ scale: selected ? 1.12 : 1 }],
              }}
            >
              <Text style={{ fontSize: 22, opacity: selected || value === null ? 1 : 0.45 }}>{face}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Shared section styles ───────────────────────────────────────────────────

export const sharedStyles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 14,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  endBtn: {
    borderWidth: 2,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  nextBtn: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  saveBtn: {
    borderWidth: 2,
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 3,
  },
});
