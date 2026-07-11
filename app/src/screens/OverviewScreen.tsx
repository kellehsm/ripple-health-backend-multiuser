import React from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { MetricCard } from "../components/MetricCard";

// Cross-domain snapshot: one card per major area, plus the "today's pattern"
// timeline (mood -> spend -> meal -> glucose spike) merged from /summary/pattern.
export function OverviewScreen() {
  const { theme } = useTheme();

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <Text style={[styles.greeting, { color: theme.textStrong }]}>Good morning, Kelly</Text>

      <View style={styles.grid}>
        <MetricCard label="Steps" value="8,412" icon="walk" colorKey="teal" />
        <MetricCard label="Mood" value="4 / 5" icon="heart" colorKey="coral" />
        <MetricCard label="Glucose peak" value="162" icon="pulse" colorKey="pink" />
        <MetricCard label="Spent today" value="$34" icon="wallet" colorKey="green" />
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Today's pattern</Text>
        {/* TODO: render api.pattern(userId) as a horizontal timeline,
            reusing the dot-and-line layout from the approved mockup */}
        <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10 }}>
          Timeline of mood, spending, meals, and glucose events goes here.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  greeting: { fontSize: 20, fontWeight: "600", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, marginTop: 4 },
  cardTitle: { fontSize: 14, fontWeight: "500" },
});
