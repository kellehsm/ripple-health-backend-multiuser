import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { fonts } from "../theme/typography";
import { useFeatures } from "../context/FeaturesContext";
import { CARD_SHADOW } from "../theme/styleUtils";

export function MedCycleScreen() {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const { medsEnabled, cycleEnabled } = useFeatures();

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      {medsEnabled && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Medications</Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10, fontFamily: fonts.regular }}>
            Medication schedule and tracking goes here.
          </Text>
        </View>
      )}
      {cycleEnabled && (
        <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
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
    ...CARD_SHADOW,
  },
  cardTitle: { fontSize: 14, fontWeight: "500", marginBottom: 8, fontFamily: fonts.medium },
});
