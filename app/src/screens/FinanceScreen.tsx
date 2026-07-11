import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";

// Manual entry now; source='goldfinch_import' rows can appear here later
// without any UI changes once the Goldfinch export/webhook exists.
export function FinanceScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Spending this week</Text>
        <Text style={{ color: theme.green.sub, fontSize: 12, marginTop: 4 }}>$212 of $300 budget</Text>
        <View style={[styles.progressTrack, { backgroundColor: theme.green.bg }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.green.sub, width: "70%" }]} />
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Stress-spend correlation</Text>
        {/* TODO: chart spending vs. inverted mood score over the last 14-30 days */}
        <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10 }}>
          Spending vs. mood overlay chart goes here.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: "500" },
  progressTrack: { height: 8, borderRadius: 6, overflow: "hidden", marginTop: 10 },
  progressFill: { height: "100%" },
});
