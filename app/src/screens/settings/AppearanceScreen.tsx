import React from "react";
import { ScrollView, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { fonts } from "../../theme/typography";
import { BG_PRESETS } from "../../theme/theme";

export function AppearanceScreen() {
  const { theme, mode, toggle, preset, setPreset } = useTheme();

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
            <Text style={[styles.modeLabel, { color: mode === m ? theme.teal.fg : theme.textStrong }]}>
              {m === "light" ? "Light" : "Dark"}
            </Text>
            {mode === m && (
              <Ionicons name="checkmark" size={18} color={theme.teal.bar} style={{ marginLeft: "auto" }} />
            )}
          </Pressable>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Background theme</Text>
        <Text style={[styles.body, { color: theme.textSoft }]}>
          Sets page, card, and surface backgrounds. Premium themes also change the loading animation.
        </Text>

        {BG_PRESETS.map((p) => {
          const isActive = preset.id === p.id;
          const swatch = mode === "dark" ? p.pageDark : p.page;
          const cardSwatch = mode === "dark" ? p.cardDark : p.card;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPreset(p)}
              style={[
                styles.presetRow,
                {
                  borderColor: isActive ? theme.teal.bar : theme.cardBorder,
                  backgroundColor: isActive ? theme.teal.bg : "transparent",
                },
              ]}
            >
              <View style={styles.swatches}>
                <View style={[styles.swatch, { backgroundColor: swatch, borderColor: theme.cardBorder }]} />
                <View style={[styles.swatch, { backgroundColor: cardSwatch, borderColor: theme.cardBorder, marginLeft: -6 }]} />
              </View>
              <View style={styles.presetText}>
                <Text style={[styles.presetLabel, { color: isActive ? theme.teal.fg : theme.textStrong }]}>
                  {p.label}
                  {p.premium ? "  ✦" : ""}
                </Text>
                {p.premium && (
                  <Text style={[styles.presetSub, { color: theme.textSoft }]}>Premium · custom loading animation</Text>
                )}
              </View>
              {isActive && <Ionicons name="checkmark" size={18} color={theme.teal.bar} />}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitle: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  body: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
  },
  modeLabel: { fontSize: 15, fontWeight: "500", fontFamily: fonts.medium },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
  },
  swatches: { flexDirection: "row", alignItems: "center" },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1 },
  presetText: { flex: 1 },
  presetLabel: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
  presetSub: { fontSize: 11, marginTop: 2, fontFamily: fonts.regular },
});
