import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";

const APP_VERSION = "1.0.0";

export function HelpAboutScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>About Ripple</Text>
        <View style={styles.infoRow}>
          <Text style={[styles.label, { color: theme.textSoft }]}>Version</Text>
          <Text style={[styles.value, { color: theme.textStrong }]}>{APP_VERSION}</Text>
        </View>
        <Text style={[styles.note, { color: theme.textSoft }]}>
          Ripple is a personal wellness dashboard for tracking mood, glucose, meals,
          activity, finance, and more — all on your own server.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>What's new</Text>
        <Text style={[styles.changelogItem, { color: theme.textStrong }]}>v1.0.0</Text>
        <Text style={[styles.note, { color: theme.textSoft }]}>
          Initial release — health dashboard, glucose tracking, mood check-ins, meal logging,
          life tracking, finance overview, and adaptive notification scheduling.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Help & FAQ</Text>
        <Text style={[styles.note, { color: theme.textSoft }]}>
          In-app FAQ and help docs coming soon.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 14 },
  value: { fontSize: 14, fontWeight: "500" },
  note: { fontSize: 13, lineHeight: 18 },
  changelogItem: { fontSize: 13, fontWeight: "600" },
});
