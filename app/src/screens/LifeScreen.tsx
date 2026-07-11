import React, { useState } from "react";
import { ScrollView, View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";

// Reading + hobbies + quick meal logging. Hobbies use the same
// parent-entity/log pattern as books, just with a generic "amount" field.
export function LifeScreen() {
  const { theme } = useTheme();
  const [mealText, setMealText] = useState("");

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Currently reading</Text>
        <Text style={{ color: theme.textStrong, fontSize: 14, marginTop: 6 }}>Project Hail Mary</Text>
        <View style={[styles.progressTrack, { backgroundColor: theme.teal.bg }]}>
          <View style={[styles.progressFill, { backgroundColor: theme.teal.bar, width: "62%" }]} />
        </View>
        <Text style={{ color: theme.textSoft, fontSize: 12 }}>page 234 of 476 · 18 pages today</Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Hobbies</Text>
        {/* TODO: list hobbies from api.hobbies(userId), each with a quick
            "+15 min" style log button, same interaction as reading pages */}
        <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10 }}>
          Guitar practice, woodworking, etc. - each tracked like a mini book.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Log a meal</Text>
        <View style={styles.mealRow}>
          <TextInput
            placeholder="what did you eat?"
            value={mealText}
            onChangeText={setMealText}
            style={[styles.input, { borderColor: theme.cardBorder, color: theme.textStrong }]}
            placeholderTextColor={theme.textSoft}
          />
          <Pressable style={[styles.addButton, { backgroundColor: theme.teal.bar }]}>
            <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: "500" },
  progressTrack: { height: 6, borderRadius: 6, overflow: "hidden", marginVertical: 8 },
  progressFill: { height: "100%" },
  mealRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  addButton: { borderRadius: 10, paddingHorizontal: 16, justifyContent: "center" },
});
