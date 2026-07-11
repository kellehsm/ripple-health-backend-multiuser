import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { MetricCard } from "../components/MetricCard";

// Steps/sleep/water/heart rate come from Health Connect. Glucose from Dexcom.
export function HealthScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        <MetricCard label="Steps" value="8,412" icon="walk" colorKey="teal" />
        <MetricCard label="Sleep" value="7h 12m" icon="moon" colorKey="blue" />
        <MetricCard label="Water" value="5 / 8" icon="water" colorKey="amber" />
        <MetricCard label="Heart rate" value="68 bpm" icon="pulse" colorKey="pink" />
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Glucose today</Text>
        {/* TODO: render api.glucoseToday(userId, date) as a line chart
            (react-native-svg or Victory Native) with the meal-spike callout */}
        <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10 }}>
          Glucose trend chart with meal-spike annotations goes here.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, marginTop: 4 },
  cardTitle: { fontSize: 14, fontWeight: "500" },
});
