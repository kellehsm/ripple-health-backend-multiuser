import React, { useEffect, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { api } from "../../api/client";

interface GeoResult {
  id: number;
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

export function WeatherLocationSettingsScreen() {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedLat, setSavedLat] = useState<number | null>(null);
  const [savedLon, setSavedLon] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((s: any) => {
      const w = s?.weather;
      if (w?.location_name) setSavedName(w.location_name);
      if (w?.lat != null) setSavedLat(Number(w.lat));
      if (w?.lon != null) setSavedLon(Number(w.lon));
    }).catch(() => {});
  }, []);

  async function handleSearch() {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults([]);
    setError(null);
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = await res.json() as { results?: GeoResult[] };
      setResults(json.results ?? []);
      if (!json.results?.length) setError("No cities found. Try a different spelling.");
    } catch {
      setError("Could not reach geocoding service. Check your connection.");
    } finally {
      setSearching(false);
    }
  }

  async function handleSelect(r: GeoResult) {
    setSaveStatus("saving");
    setError(null);
    try {
      await api.patchSettings({
        weather: {
          lat: r.latitude,
          lon: r.longitude,
          location_name: `${r.name}${r.admin1 ? ", " + r.admin1 : ""}, ${r.country}`,
        },
      });
      setSavedName(`${r.name}${r.admin1 ? ", " + r.admin1 : ""}, ${r.country}`);
      setSavedLat(r.latitude);
      setSavedLon(r.longitude);
      setResults([]);
      setQuery("");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setError("Failed to save location. Please try again.");
    }
  }

  async function handleClear() {
    setSaveStatus("saving");
    try {
      await api.patchSettings({ weather: { lat: null, lon: null, location_name: null } });
      setSavedName(null);
      setSavedLat(null);
      setSavedLon(null);
      setSaveStatus("idle");
    } catch {
      setSaveStatus("error");
      setError("Failed to clear location.");
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <ScrollView
        style={{ backgroundColor: theme.page }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.groupLabel, { color: theme.textSoft }]}>CURRENT LOCATION</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.desc, { color: theme.textSoft }]}>
            Weather data is fetched daily from Open-Meteo (free, no account needed) and used to surface patterns in your health logs — for example, whether your step count or mood differs on rainy versus dry days.
          </Text>
          {savedName ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Ionicons name="location" size={16} color={theme.teal.fg} />
              <Text style={{ color: theme.textStrong, fontSize: 14, flex: 1 }}>{savedName}</Text>
              <Pressable onPress={handleClear} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.textSoft} />
              </Pressable>
            </View>
          ) : (
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>No location set.</Text>
          )}
          {savedLat != null && savedLon != null && (
            <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
              {savedLat.toFixed(4)}, {savedLon.toFixed(4)}
            </Text>
          )}
          {saveStatus === "saved" && (
            <View style={[styles.banner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
              <Ionicons name="checkmark-circle-outline" size={14} color={theme.teal.fg} />
              <Text style={{ color: theme.teal.fg, fontSize: 12, marginLeft: 6 }}>Location saved. Weather will sync tonight.</Text>
            </View>
          )}
        </View>

        <Text style={[styles.groupLabel, { color: theme.textSoft }]}>SEARCH</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="City name, e.g. Austin"
              placeholderTextColor={theme.textSoft}
              style={[styles.input, { flex: 1, color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.page }]}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              autoCorrect={false}
            />
            <Pressable
              onPress={handleSearch}
              disabled={searching || !query.trim()}
              style={[styles.searchBtn, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
            >
              {searching
                ? <ActivityIndicator size="small" color={theme.teal.fg} />
                : <Ionicons name="search" size={18} color={theme.teal.fg} />}
            </Pressable>
          </View>

          {error && (
            <View style={[styles.banner, { backgroundColor: theme.coral.tint, borderColor: theme.coral.solid, marginTop: 8 }]}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.coral.fg} />
              <Text style={{ color: theme.coral.fg, fontSize: 12, marginLeft: 6, flex: 1 }}>{error}</Text>
            </View>
          )}

          {results.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => handleSelect(r)}
              style={[styles.resultRow, { borderColor: theme.cardBorder }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "600" }}>
                  {r.name}{r.admin1 ? `, ${r.admin1}` : ""}
                </Text>
                <Text style={{ color: theme.textSoft, fontSize: 12 }}>
                  {r.country} · {r.latitude.toFixed(2)}, {r.longitude.toFixed(2)}
                </Text>
              </View>
              {saveStatus === "saving" ? (
                <ActivityIndicator size="small" color={theme.teal.fg} />
              ) : (
                <Ionicons name="chevron-forward" size={16} color={theme.textSoft} />
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 12, marginBottom: 4 },
  input: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  searchBtn: { borderWidth: 2, borderRadius: 16, padding: 10 },
  resultRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingVertical: 10, gap: 8 },
  banner: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
});
