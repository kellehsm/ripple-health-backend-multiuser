import React from "react";
import { ScrollView, View, Text, Switch, StyleSheet } from "react-native";
import { useTheme } from "../../theme/ThemeContext";
import { useCardBg } from "../../theme/AppSettingsContext";
import { fonts } from "../../theme/typography";
import { useFeatures } from "../../context/FeaturesContext";

export function FeaturesScreen() {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const { medsEnabled, cycleEnabled, setMeds, setCycle } = useFeatures();

  const activeLabel = medsEnabled && cycleEnabled
    ? "Med/Cycle tab active — purple heart icon"
    : medsEnabled
      ? "Meds tab active"
      : cycleEnabled
        ? "Cycle tab active"
        : null;

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>Health Modules</Text>
        <Text style={[styles.body, { color: theme.textSoft }]}>
          Enabled modules appear as a tab in the navigation bar.
        </Text>

        <View style={[styles.row, { borderTopColor: theme.cardBorder }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: theme.textStrong }]}>Medications</Text>
            <Text style={[styles.rowSub, { color: theme.textSoft }]}>Track daily meds and schedules</Text>
          </View>
          <Switch
            value={medsEnabled}
            onValueChange={setMeds}
            trackColor={{ false: theme.cardBorder, true: theme.pink.bg }}
            thumbColor={medsEnabled ? theme.pink.fg : theme.textSoft}
          />
        </View>

        <View style={[styles.row, { borderTopColor: theme.cardBorder }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowLabel, { color: theme.textStrong }]}>Cycle Tracking</Text>
            <Text style={[styles.rowSub, { color: theme.textSoft }]}>Monitor cycle and symptoms</Text>
          </View>
          <Switch
            value={cycleEnabled}
            onValueChange={setCycle}
            trackColor={{ false: theme.cardBorder, true: theme.pink.bg }}
            thumbColor={cycleEnabled ? theme.pink.fg : theme.textSoft}
          />
        </View>
      </View>

      {activeLabel && (
        <View style={[styles.badge, { backgroundColor: theme.pink.bg, borderColor: theme.pink.fg }]}>
          <Text style={{ color: theme.pink.fg, fontSize: 13, fontFamily: fonts.regular }}>
            {activeLabel}
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
  sectionTitle: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold, marginBottom: 2 },
  body: { fontSize: 13, lineHeight: 18, fontFamily: fonts.regular, marginBottom: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 0.5,
    gap: 12,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600", fontFamily: fonts.semiBold },
  rowSub: { fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
  badge: { borderRadius: 12, borderWidth: 1, padding: 12 },
});
