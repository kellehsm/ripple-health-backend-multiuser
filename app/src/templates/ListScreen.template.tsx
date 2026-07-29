/**
 * LIST SCREEN TEMPLATE
 * Use for: ChallengesScreen, HistoryScreen, LeaderboardScreen,
 *          InsightsTrendsScreen, MedicationImportScreen, GlobalSearchScreen
 *
 * Pattern: Optional search/filter bar → grouped or flat list of rows.
 * Each row has a left icon/avatar, primary + secondary text, and a right
 * action or value. Long lists use FlatList for performance.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { fonts } from "../theme/typography";

type ListItem = { id: string; title: string; subtitle: string; value: string; colorKey: "teal" | "amber" | "coral" | "pink" | "green" | "red" };

const SAMPLE_ITEMS: ListItem[] = [
  { id: "1", title: "Row title",    subtitle: "Supporting detail · Today",    value: "—", colorKey: "teal"  },
  { id: "2", title: "Another row",  subtitle: "Supporting detail · Yesterday", value: "—", colorKey: "amber" },
  { id: "3", title: "Third row",    subtitle: "Supporting detail · Mon",       value: "—", colorKey: "coral" },
];

export function ListScreenTemplate() {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const [query, setQuery] = useState("");

  const filtered = SAMPLE_ITEMS.filter((i) =>
    i.title.toLowerCase().includes(query.toLowerCase())
  );

  function renderItem({ item }: { item: ListItem }) {
    const c = theme[item.colorKey];
    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: cardBg, borderColor: theme.cardBorder, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        {/* Left icon */}
        <View style={[styles.iconWrap, { backgroundColor: c.bg }]}>
          <Ionicons name="ellipse" size={18} color={c.fg} />
        </View>

        {/* Text */}
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: theme.textStrong }]}>{item.title}</Text>
          <Text style={[styles.rowSubtitle, { color: theme.textSoft }]} numberOfLines={1}>
            {item.subtitle}
          </Text>
        </View>

        {/* Right value + chevron */}
        <Text style={[styles.rowValue, { color: theme.textStrong }]}>{item.value}</Text>
        <Ionicons name="chevron-forward" size={15} color={theme.textSoft} />
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      {/* ── Search / filter bar ── */}
      <View style={[styles.searchBar, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Ionicons name="search-outline" size={16} color={theme.textSoft} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search…"
          placeholderTextColor={theme.textSoft}
          style={[styles.searchInput, { color: theme.textStrong }]}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={16} color={theme.textSoft} />
          </Pressable>
        )}
      </View>

      {/* ── Filter chip row (optional) ── */}
      <View style={styles.filterRow}>
        {["All", "This week", "Completed", "Active"].map((f) => (
          <Pressable
            key={f}
            style={[
              styles.filterChip,
              f === "All"
                ? { backgroundColor: theme.teal.bg, borderColor: theme.teal.bar }
                : { backgroundColor: cardBg, borderColor: theme.cardBorder },
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: f === "All" ? theme.teal.fg : theme.textSoft },
              ]}
            >
              {f}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── List ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="list-outline" size={36} color={theme.textSoft} />
            <Text style={[styles.emptyText, { color: theme.textSoft }]}>
              No results found
            </Text>
          </View>
        }
      />

      {/* ── FAB (floating add button) ── */}
      <Pressable style={[styles.fab, { backgroundColor: theme.teal.bar }]}>
        <Ionicons name="add" size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },

  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  filterChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 5 },
  filterChipText: { fontSize: 12, fontWeight: "600", fontFamily: fonts.semiBold },

  listContent: { padding: 16, paddingTop: 4 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },
  rowSubtitle: { fontSize: 12, marginTop: 2, fontFamily: fonts.regular },
  rowValue: { fontSize: 14, fontWeight: "600", fontFamily: fonts.semiBold },

  emptyState: { alignItems: "center", gap: 10, paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },

  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
});
