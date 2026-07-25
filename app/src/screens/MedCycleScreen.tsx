import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";
import { useFeatures } from "../context/FeaturesContext";

export function MedCycleScreen() {
  const { theme } = useTheme();
  const { medsEnabled, cycleEnabled } = useFeatures();

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      {medsEnabled && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Medications</Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10, fontFamily: fonts.regular }}>
            Medication schedule and tracking goes here.
          </Text>
        </View>
      )}
      {cycleEnabled && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Cycle</Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10, fontFamily: fonts.regular }}>
            Cycle tracking goes here.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: { fontSize: 14, fontWeight: "500", marginBottom: 8, fontFamily: fonts.medium },
});
