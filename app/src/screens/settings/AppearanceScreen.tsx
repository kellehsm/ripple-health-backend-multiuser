import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";

export function AppearanceScreen() {
  const { theme, mode, toggle } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Color mode</Text>

        {(["light", "dark"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => { if (mode !== m) toggle(); }}
            style={[
              styles.modeRow,
              {
                borderColor: mode === m ? theme.teal.bar : theme.cardBorder,
                backgroundColor: mode === m ? theme.teal.bg : "transparent",
              },
            ]}
          >
            <Ionicons
              name={m === "light" ? "sunny" : "moon"}
              size={20}
              color={mode === m ? theme.teal.fg : theme.textSoft}
            />
            <Text
              style={[
                styles.modeLabel,
                { color: mode === m ? theme.teal.fg : theme.textStrong },
              ]}
            >
              {m === "light" ? "Light" : "Dark"}
            </Text>
            {mode === m && (
              <Ionicons name="checkmark" size={18} color={theme.teal.bar} style={{ marginLeft: "auto" }} />
            )}
          </Pressable>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Accent themes</Text>
        <Text style={[styles.comingSoon, { color: theme.textSoft }]}>
          Additional accent colour themes coming soon.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
  },
  modeLabel: { fontSize: 15, fontWeight: "500" },
  comingSoon: { fontSize: 13 },
});
