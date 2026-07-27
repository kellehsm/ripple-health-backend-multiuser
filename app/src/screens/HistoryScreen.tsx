import React, { useState, useMemo } from "react";
import {
  ScrollView, View, Text, TextInput, Pressable,
  StyleSheet
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ShadowCard } from "../components/ShadowCard";
import { formatDisplayDate } from "../utils/dateUtils";


type FilterMode = "glucose" | "meals" | "mood" | "spending";

export function HistoryScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;
  const card = theme.card;
  const styles = useMemo(() => makeStyles(ink, card), [ink, card]);
  const [mode, setMode] = useState<FilterMode>("glucose");
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const [glThreshold, setGlThreshold] = useState("180");
  const [glBucket, setGlBucket] = useState("");

  const [mealQ, setMealQ] = useState("");
  const [mealMinCarbs, setMealMinCarbs] = useState("");

  const [moodMin, setMoodMin] = useState("");
  const [moodMax, setMoodMax] = useState("");

  const [spendMin, setSpendMin] = useState("");
  const [spendCategory, setSpendCategory] = useState("");

  async function handleSearch() {
    setLoading(true);
    setResults([]);
    setSearchError(null);
    setHasSearched(true);
    try {
      let data: any[] = [];
      if (mode === "glucose") {
        data = await api.searchGlucose({
          threshold: glThreshold ? parseInt(glThreshold) : undefined,
          bucket: glBucket || undefined,
        });
      } else if (mode === "meals") {
        data = await api.searchMeals({
          q: mealQ || undefined,
          min_carbs: mealMinCarbs ? parseFloat(mealMinCarbs) : undefined,
        });
      } else if (mode === "mood") {
        data = await api.searchMood({
          min_score: moodMin ? parseInt(moodMin) : undefined,
          max_score: moodMax ? parseInt(moodMax) : undefined,
        });
      } else if (mode === "spending") {
        data = await api.searchSpending({
          min_amount: spendMin ? parseFloat(spendMin) : undefined,
          category: spendCategory || undefined,
        });
      }
      setResults(data);
    } catch {
      setSearchError("Search couldn't complete. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }


  const MODES: FilterMode[] = ["glucose", "meals", "mood", "spending"];
  const modeLabel: Record<FilterMode, string> = { glucose: "Glucose", meals: "Meals", mood: "Mood", spending: "Spending" };

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
      <View style={styles.modeRow}>
        {MODES.map(m => (
          <Pressable
            key={m}
            onPress={() => { setMode(m); setResults([]); }}
            style={[styles.modeChip, {
              backgroundColor: mode === m ? theme.teal.bar : theme.page,
              borderColor: theme.ink,
            }]}
          >
            <Text style={{ color: mode === m ? "#fff" : theme.textSoft, fontSize: 13 }}>
              {modeLabel[m]}
            </Text>
          </Pressable>
        ))}
      </View>

      <ShadowCard size="card" rotate={-0.4}>
        {mode === "glucose" && (
          <>
            <Text style={[styles.fieldLabel, { color: theme.textSoft }]}>Average above (mg/dL)</Text>
            <TextInput
              value={glThreshold}
              onChangeText={setGlThreshold}
              keyboardType="numeric"
              placeholder="180"
              placeholderTextColor={theme.textSoft}
              style={[styles.input, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
            />
            <Text style={[styles.fieldLabel, { color: theme.textSoft }]}>Time of day (optional)</Text>
            <View style={styles.bucketRow}>
              {["", "morning", "afternoon", "evening", "night"].map(b => (
                <Pressable key={b || "any"}
                  onPress={() => setGlBucket(b)}
                  style={[styles.bucketChip, { backgroundColor: glBucket === b ? theme.berry.bg : theme.page, borderColor: glBucket === b ? theme.berry.sub : theme.ink }]}
                >
                  <Text style={{ color: glBucket === b ? theme.berry.fg : theme.textSoft, fontSize: 12 }}>
                    {b || "Any"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {mode === "meals" && (
          <>
            <Text style={[styles.fieldLabel, { color: theme.textSoft }]}>Food name contains</Text>
            <TextInput
              value={mealQ}
              onChangeText={setMealQ}
              placeholder="e.g. rice, pasta..."
              placeholderTextColor={theme.textSoft}
              style={[styles.input, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
            />
            <Text style={[styles.fieldLabel, { color: theme.textSoft }]}>Min carbs (g)</Text>
            <TextInput
              value={mealMinCarbs}
              onChangeText={setMealMinCarbs}
              keyboardType="numeric"
              placeholder="e.g. 60"
              placeholderTextColor={theme.textSoft}
              style={[styles.input, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
            />
          </>
        )}

        {mode === "mood" && (
          <>
            <Text style={[styles.fieldLabel, { color: theme.textSoft }]}>Score range (1 = Bad, 5 = Great)</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TextInput
                value={moodMin}
                onChangeText={setMoodMin}
                keyboardType="numeric"
                placeholder="Min"
                placeholderTextColor={theme.textSoft}
                style={[styles.input, { flex: 1, color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
              />
              <TextInput
                value={moodMax}
                onChangeText={setMoodMax}
                keyboardType="numeric"
                placeholder="Max"
                placeholderTextColor={theme.textSoft}
                style={[styles.input, { flex: 1, color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
              />
            </View>
          </>
        )}

        {mode === "spending" && (
          <>
            <Text style={[styles.fieldLabel, { color: theme.textSoft }]}>Min amount ($)</Text>
            <TextInput
              value={spendMin}
              onChangeText={setSpendMin}
              keyboardType="numeric"
              placeholder="e.g. 50"
              placeholderTextColor={theme.textSoft}
              style={[styles.input, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
            />
            <Text style={[styles.fieldLabel, { color: theme.textSoft }]}>Category contains</Text>
            <TextInput
              value={spendCategory}
              onChangeText={setSpendCategory}
              placeholder="e.g. food, transport..."
              placeholderTextColor={theme.textSoft}
              style={[styles.input, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
            />
          </>
        )}

        <Pressable
          onPress={handleSearch}
          disabled={loading}
          style={[styles.searchBtn, { backgroundColor: theme.teal.bar }]}
        >
          {loading
            ? <LoadingIndicator size="small" color="#fff" />
            : <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>Search</Text>
          }
        </Pressable>
      </ShadowCard>

      {searchError ? (
        <ShadowCard size="card" bg={theme.coral.tint}>
          <Text style={{ color: theme.coral.fg, fontSize: 13 }}>{searchError}</Text>
        </ShadowCard>
      ) : null}

      {!loading && hasSearched && !searchError && results.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title="No results found"
          message={`No ${modeLabel[mode].toLowerCase()} entries match your filters. Try adjusting the search criteria.`}
        />
      ) : null}

      {results.length > 0 ? (
        <ShadowCard size="card">
          <Text style={[styles.resultsHeader, { color: theme.textSoft }]}>{results.length} result{results.length === 1 ? "" : "s"}</Text>
          {results.map((r, i) => (
            <View key={i} style={[styles.resultRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: theme.cardBorder }]}>
              {mode === "glucose" && (
                <>
                  <Text style={[styles.resultDate, { color: theme.textSoft }]}>{formatDisplayDate(r.date)}</Text>
                  <Text style={{ color: theme.berry.sub, fontWeight: "500" }}>avg {r.avg_mg_dl} mg/dL</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 12 }}>peak {r.max_mg_dl} · {r.reading_count} readings</Text>
                </>
              )}
              {mode === "meals" && (
                <>
                  <Text style={[styles.resultDate, { color: theme.textSoft }]}>{formatDisplayDate(r.logged_at)}</Text>
                  <Text style={{ color: theme.textStrong, fontWeight: "500" }}>{r.name}</Text>
                  {r.carbs_g != null && <Text style={{ color: theme.textSoft, fontSize: 12 }}>{Math.round(r.carbs_g)}g carbs{r.calories != null ? " · " + Math.round(r.calories) + " cal" : ""}</Text>}
                </>
              )}
              {mode === "mood" && (
                <>
                  <Text style={[styles.resultDate, { color: theme.textSoft }]}>{formatDisplayDate(r.logged_at)}</Text>
                  <Text style={{ color: theme.textStrong, fontWeight: "500" }}>{r.mood_label ?? "Score " + r.mood_score}</Text>
                  {r.entry_text && <Text style={{ color: theme.textSoft, fontSize: 12 }} numberOfLines={2}>{r.entry_text}</Text>}
                </>
              )}
              {mode === "spending" && (
                <>
                  <Text style={[styles.resultDate, { color: theme.textSoft }]}>{formatDisplayDate(r.logged_at)}</Text>
                  <Text style={{ color: theme.purple.sub, fontWeight: "500" }}>${Number(r.amount).toFixed(2)}</Text>
                  {r.category && <Text style={{ color: theme.textSoft, fontSize: 12 }}>{r.category}</Text>}
                </>
              )}
            </View>
          ))}
        </ShadowCard>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(ink: string, card: string) {
  const shadow = {
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12 as const,
    shadowRadius: 14,
    elevation: 4,
  };
  return StyleSheet.create({
  content: { padding: 16, gap: 12 },
  modeRow: { flexDirection: "row", gap: 8 },
  modeChip: {
    flex: 1, borderWidth: 2, borderRadius: 16, paddingVertical: 8, alignItems: "center",
    shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  card: { borderRadius: 26, borderWidth: 2, borderColor: ink, padding: 16, gap: 10, backgroundColor: card, ...shadow },
  fieldLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
  input: {
    borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14,
    shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  bucketRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  bucketChip: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  searchBtn: {
    borderRadius: 16, borderWidth: 2, borderColor: ink, paddingVertical: 12, alignItems: "center", marginTop: 4,
    shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  resultsHeader: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 },
  resultRow: { paddingVertical: 10, gap: 2, minHeight: 48 },
  resultDate: { fontSize: 11 },
  });
}
