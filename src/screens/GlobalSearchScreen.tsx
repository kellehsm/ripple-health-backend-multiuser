import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

type SearchResults = {
  meals: any[];
  mood: any[];
  journal: any[];
  books: any[];
  hobbies: any[];
};

const EMPTY: SearchResults = { meals: [], mood: [], journal: [], books: [], hobbies: [] };

export function GlobalSearchScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setResults(null); return; }
    debounceRef.current = setTimeout(() => runSearch(text), 350);
  }

  async function runSearch(q: string) {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const data = await api.searchGlobal(q.trim());
      if (seq !== seqRef.current) return;
      setResults(data ?? EMPTY);
    } catch {
      if (seq !== seqRef.current) return;
      setResults(EMPTY);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }

  const totalHits = results
    ? results.meals.length + results.mood.length + results.journal.length + results.books.length + results.hobbies.length
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.ink }]}>
        <Ionicons name="search" size={18} color={theme.textSoft} />
        <TextInput
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Search meals, moods, books, hobbies..."
          placeholderTextColor={theme.textSoft}
          autoFocus
          style={[styles.searchInput, { color: theme.textStrong }]}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (query.trim().length >= 2) runSearch(query);
          }}
        />
        {loading && <LoadingIndicator size="small" color={theme.teal.bar} />}
        {!loading && query.length > 0 && (
          <Pressable onPress={() => { setQuery(""); setResults(null); }} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textSoft} />
          </Pressable>
        )}
      </View>

      {!results && !loading && (
        <View style={styles.emptyState}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: "center" }}>
            Type to search across all your logged data
          </Text>
        </View>
      )}

      {results && totalHits === 0 && !loading && (
        <View style={styles.emptyState}>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: "center" }}>
            No results for "{query}"
          </Text>
        </View>
      )}

      {results && totalHits > 0 && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {results.meals.length > 0 && (
            <Section title="Meals" icon="restaurant-outline" count={results.meals.length} theme={theme}>
              {results.meals.map((m) => (
                <Row
                  key={m.id}
                  title={m.name}
                  sub={[m.meal_type, m.logged_at ? relativeDate(m.logged_at) : null].filter(Boolean).join(" · ")}
                  theme={theme}
                />
              ))}
            </Section>
          )}
          {results.mood.length > 0 && (
            <Section title="Mood" icon="happy-outline" count={results.mood.length} theme={theme}>
              {results.mood.map((m) => (
                <Row
                  key={m.id}
                  title={(m.mood_label ? m.mood_label + " " : "") + "(" + m.mood_score + "/10)"}
                  sub={m.entry_text ? m.entry_text.slice(0, 80) : (m.logged_at ? relativeDate(m.logged_at) : "")}
                  theme={theme}
                />
              ))}
            </Section>
          )}
          {results.journal.length > 0 && (
            <Section title="Notes" icon="document-text-outline" count={results.journal.length} theme={theme}>
              {results.journal.map((j) => (
                <Row
                  key={j.id}
                  title={j.entry_text?.slice(0, 70) ?? "Note"}
                  sub={j.logged_at ? relativeDate(j.logged_at) : ""}
                  theme={theme}
                />
              ))}
            </Section>
          )}
          {results.books.length > 0 && (
            <Section title="Books" icon="book-outline" count={results.books.length} theme={theme}>
              {results.books.map((b) => (
                <Row
                  key={b.id}
                  title={b.title}
                  sub={[b.author, b.status].filter(Boolean).join(" · ")}
                  theme={theme}
                />
              ))}
            </Section>
          )}
          {results.hobbies.length > 0 && (
            <Section title="Hobbies" icon="bicycle-outline" count={results.hobbies.length} theme={theme}>
              {results.hobbies.map((h) => (
                <Row
                  key={h.id}
                  title={h.name}
                  sub={[h.category, h.status].filter(Boolean).join(" · ")}
                  theme={theme}
                />
              ))}
            </Section>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, icon, count, children, theme }: { title: string; icon: string; count: number; children: React.ReactNode; theme: any }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={13} color={theme.textSoft} />
        <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>{title.toUpperCase()}</Text>
        <View style={[styles.countBadge, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
          <Text style={[styles.countText, { color: theme.teal.fg }]}>{count}</Text>
        </View>
      </View>
      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {children}
      </View>
    </View>
  );
}

function Row({ title, sub, theme }: { title: string; sub: string; theme: any }) {
  return (
    <View style={[styles.row, { borderBottomColor: theme.cardBorder }]}>
      <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{title}</Text>
      {sub ? <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    margin: 16,
    borderRadius: 22,
    borderWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  sectionLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  countBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  countText: { fontSize: 9, fontWeight: "900" },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
