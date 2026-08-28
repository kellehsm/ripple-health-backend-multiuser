import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import AsyncStorage from "@react-native-async-storage/async-storage";

const RECENT_KEY = "ripple.search.recent";
const MAX_RECENT = 5;

async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).filter((s) => typeof s === "string") : [];
  } catch { return []; }
}

async function saveRecentSearch(q: string): Promise<string[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return await loadRecentSearches();
  try {
    const list = await loadRecentSearches();
    const next = [trimmed, ...list.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  } catch { return []; }
}
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { ScreenBackground } from "../components/ScreenBackground";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES } from "../theme/tokens";
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
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(function () {
    loadRecentSearches().then(setRecent);
    return function () {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleQueryChange(text: string) {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setResults(null); setSearchError(false); return; }
    debounceRef.current = setTimeout(() => runSearch(text), 350);
  }

  async function runSearch(q: string) {
    const seq = ++seqRef.current;
    setLoading(true);
    setSearchError(false);
    try {
      const data = await api.searchGlobal(q.trim());
      if (seq !== seqRef.current) return;
      setResults(data ?? EMPTY);
      saveRecentSearch(q).then(setRecent).catch(() => {});
    } catch {
      if (seq !== seqRef.current) return;
      setResults(null);
      setSearchError(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }

  const totalHits = results
    ? results.meals.length + results.mood.length + results.journal.length + results.books.length + results.hobbies.length
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="global_search" />
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
          <Pressable onPress={() => { setQuery(""); setResults(null); }} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={theme.textSoft} />
          </Pressable>
        )}
      </View>

      {!results && !loading && !searchError && (
        <View style={styles.emptyState}>
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.body, textAlign: "center" }}>
            Type to search across all your logged data
          </Text>
          {recent.length > 0 && (
            <View style={{ marginTop: 20, width: "100%", paddingHorizontal: 24 }}>
              <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8 }}>RECENT</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {recent.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => { setQuery(q); runSearch(q); }}
                    style={{
                      borderWidth: 1.5,
                      borderColor: theme.cardBorder,
                      backgroundColor: theme.card,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 14,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={"Search again for " + q}
                  >
                    <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.label }}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {searchError && !loading && (
        <View style={styles.emptyState}>
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.body, textAlign: "center" }}>
            Couldn't search right now. Check your connection.
          </Text>
          <Pressable
            onPress={() => { if (query.trim().length >= 2) runSearch(query); }}
            style={[styles.retryBtn, { borderColor: theme.ink, backgroundColor: theme.card }]}
          >
            <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {results && totalHits === 0 && !loading && (
        <View style={styles.emptyState}>
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.body, textAlign: "center" }}>
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
                  onPress={() => navigation.navigate("Tabs", { screen: "Meals" })}
                />
              ))}
            </Section>
          )}
          {results.mood.length > 0 && (
            <Section title="Mood" icon="happy-outline" count={results.mood.length} theme={theme}>
              {results.mood.map((m) => (
                <Row
                  key={m.id}
                  title={(m.mood_label ? m.mood_label + " " : "") + "(" + m.mood_score + "/5)"}
                  sub={m.entry_text ? m.entry_text.slice(0, 80) : (m.logged_at ? relativeDate(m.logged_at) : "")}
                  theme={theme}
                  onPress={() => navigation.navigate("History")}
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
                  onPress={() => navigation.navigate("History")}
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
                  onPress={() =>
                    b.status === "finished"
                      ? navigation.navigate("Completed")
                      : navigation.navigate("Tabs", { screen: "Life" })
                  }
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
                  onPress={() => navigation.navigate("Tabs", { screen: "Life" })}
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

function Row({ title, sub, theme, onPress }: { title: string; sub: string; theme: any; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.cardBorder, flexDirection: "row", alignItems: "center" },
        pressed && onPress ? { opacity: 0.7 } : null,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.body, fontWeight: "600" }} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, marginTop: 2 }} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={14} color={theme.textSoft} /> : null}
    </Pressable>
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
    fontSize: FONT_SIZES.subheading,
    paddingVertical: 0,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  content: { paddingHorizontal: 16, paddingBottom: 32 },
  retryBtn: {
    marginTop: 12,
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  sectionLabel: { fontSize: FONT_SIZES.micro, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  countBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 2 },
  countText: { fontSize: FONT_SIZES.micro, fontWeight: "900" },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
