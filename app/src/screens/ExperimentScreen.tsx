import React, { useState, useCallback, useEffect } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { toast } from "../lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Experiment = {
  id: string;
  description: string;
  start_date: string;
  end_date: string;
  status: "active" | "completed" | "abandoned";
  duration_days: number;
  metrics: string[];
};

type MetricResult = {
  metric: string;
  before_value: number | null;
  during_value: number | null;
  has_before_data: boolean;
};

type ExperimentResults = {
  experiment: Experiment;
  results: MetricResult[];
  hedge: string;
  has_before_data: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDateRange(start: string, end: string): string {
  return fmtDate(start) + " – " + fmtDate(end);
}

function statusColor(status: string, theme: any): string {
  if (status === "active") return theme.teal.solid;
  if (status === "completed") return theme.berry?.solid ?? theme.textSoft;
  return theme.textSoft;
}

function deltaStr(before: number | null, during: number | null, metric: string): { text: string; color: string } | null {
  if (before === null || during === null) return null;
  const diff = during - before;
  const isPositive = diff > 0;
  const isNegative = diff < 0;
  const absDiff = Math.abs(diff);
  // For mood: higher is better. For sleep/TIR: higher is better.
  const color = isPositive ? "#2F9E5A" : isNegative ? "#C0392B" : "#888";
  const arrow = isPositive ? "↑" : isNegative ? "↓" : "→";
  const formattedDiff = metric === "tir" || metric === "Glucose TIR"
    ? arrow + " " + (isPositive ? "+" : "") + Math.round(diff) + "%"
    : metric === "sleep" || metric === "Sleep"
      ? arrow + " " + (isPositive ? "+" : "") + diff.toFixed(1) + "h"
      : arrow + " " + (isPositive ? "+" : "") + diff.toFixed(1);
  return { text: formattedDiff, color };
}

function fmtMetricValue(value: number | null, metric: string): string {
  if (value === null) return "—";
  if (metric === "tir" || metric === "Glucose TIR") return Math.round(value) + "%";
  if (metric === "sleep" || metric === "Sleep") return value.toFixed(1) + "h";
  if (metric === "mood" || metric === "Morning Mood") return value.toFixed(1) + "/5";
  return String(value);
}

const AVAILABLE_METRICS = ["Glucose TIR", "Sleep", "Morning Mood"];

// ─── Component ───────────────────────────────────────────────────────────────

export function ExperimentScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;

  const [view, setView] = useState<"list" | "new" | "results">("list");

  // List state
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New experiment state
  const [description, setDescription] = useState("");
  const [durationDays, setDurationDays] = useState<3 | 7>(7);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["Glucose TIR", "Sleep", "Morning Mood"]);
  const [creating, setCreating] = useState(false);

  // Results state
  const [resultsLoading, setResultsLoading] = useState(false);
  const [results, setResults] = useState<ExperimentResults | null>(null);
  const [resultsExperiment, setResultsExperiment] = useState<Experiment | null>(null);

  async function loadExperiments() {
    setLoading(true);
    try {
      const data = await api.getExperiments();
      setExperiments(Array.isArray(data) ? data : []);
    } catch {
      toast("Couldn't load experiments.", "error");
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(useCallback(() => {
    loadExperiments();
  }, []));

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadExperiments(); } finally { setRefreshing(false); }
  }

  function toggleMetric(metric: string) {
    setSelectedMetrics(prev =>
      prev.includes(metric) ? prev.filter(m => m !== metric) : [...prev, metric]
    );
  }

  async function handleCreate() {
    if (!description.trim()) {
      Alert.alert("Missing info", "Please describe what you'll try.");
      return;
    }
    if (selectedMetrics.length === 0) {
      Alert.alert("Missing info", "Select at least one metric to track.");
      return;
    }
    setCreating(true);
    try {
      await api.createExperiment({
        description: description.trim(),
        duration_days: durationDays,
        metrics: selectedMetrics,
      });
      toast("Experiment started!");
      setDescription("");
      setDurationDays(7);
      setSelectedMetrics(["Glucose TIR", "Sleep", "Morning Mood"]);
      setView("list");
      await loadExperiments();
    } catch {
      toast("Couldn't start experiment.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleViewResults(exp: Experiment) {
    setResultsExperiment(exp);
    setResultsLoading(true);
    setView("results");
    try {
      const data = await api.getExperimentResults(exp.id);
      setResults(data);
    } catch {
      toast("Couldn't load results.", "error");
      setResults(null);
    } finally {
      setResultsLoading(false);
    }
  }

  const s = makeStyles(ink, theme.card, theme.cardBorder);

  // ─── List view ───────────────────────────────────────────────────────────

  if (view === "list") {
    return (
      <ScrollView
        style={{ backgroundColor: theme.page }}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.solid} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 0.6, color: theme.textSoft }}>YOUR EXPERIMENTS</Text>
          <Pressable
            onPress={() => setView("new")}
            style={[s.newBtn, { backgroundColor: theme.teal.solid, borderColor: ink }]}
          >
            <Ionicons name="add" size={14} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>New</Text>
          </Pressable>
        </View>

        {loading ? (
          <View style={{ alignItems: "center", paddingTop: 40 }}>
            <LoadingIndicator size="large" color={theme.teal.solid} />
          </View>
        ) : experiments.length === 0 ? (
          <View style={[s.card, { alignItems: "center", paddingVertical: 32 }]}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🧪</Text>
            <Text style={{ color: theme.textStrong, fontSize: 16, fontWeight: "700", marginBottom: 6 }}>No experiments yet</Text>
            <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: "center", lineHeight: 18 }}>
              Run a short personal experiment — try something new and see how your metrics respond.
            </Text>
            <Pressable
              onPress={() => setView("new")}
              style={[s.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: ink, marginTop: 16, paddingHorizontal: 24 }]}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Start an experiment</Text>
            </Pressable>
          </View>
        ) : (
          experiments.map((exp) => {
            const isEnded = exp.end_date < todayStr() && exp.status === "active";
            const canViewResults = exp.status === "completed" || isEnded;
            const statusLabel = isEnded ? "ended" : exp.status;
            return (
              <View key={exp.id} style={[s.card, { borderColor: statusColor(exp.status, theme) + "60" }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "700", flex: 1, lineHeight: 20 }}>
                    {exp.description}
                  </Text>
                  <View style={[s.badge, { backgroundColor: statusColor(exp.status, theme) + "22", borderColor: statusColor(exp.status, theme) }]}>
                    <Text style={{ color: statusColor(exp.status, theme), fontSize: 10, fontWeight: "700" }}>
                      {statusLabel.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={{ color: theme.textSoft, fontSize: 12, marginBottom: 4 }}>
                  {fmtDateRange(exp.start_date, exp.end_date)}
                </Text>
                {exp.metrics && exp.metrics.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    {exp.metrics.map(m => (
                      <View key={m} style={[s.metricChip, { borderColor: theme.cardBorder }]}>
                        <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "600" }}>{m}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {canViewResults && (
                  <Pressable
                    onPress={() => void handleViewResults(exp)}
                    style={[s.primaryBtn, { backgroundColor: theme.berry?.solid ?? theme.teal.solid, borderColor: ink }]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>View Results</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  // ─── New experiment view ─────────────────────────────────────────────────

  if (view === "new") {
    return (
      <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setView("list")} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <Ionicons name="chevron-back" size={16} color={theme.teal.solid} />
          <Text style={{ color: theme.teal.solid, fontSize: 13, fontWeight: "700" }}>Back</Text>
        </Pressable>

        <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 0.6, color: theme.textSoft, marginBottom: 4 }}>NEW EXPERIMENT</Text>

        <View style={s.card}>
          <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginBottom: 6 }}>WHAT WILL YOU TRY?</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="No caffeine after 2pm, Walk after dinner..."
            placeholderTextColor={theme.textSoft}
            multiline
            numberOfLines={3}
            style={[s.textInput, { color: theme.textStrong, borderColor: ink, textAlignVertical: "top", minHeight: 70 }]}
          />

          <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 14, marginBottom: 8 }}>DURATION</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([3, 7] as const).map(d => (
              <Pressable
                key={d}
                onPress={() => setDurationDays(d)}
                style={[s.durationBtn, {
                  backgroundColor: durationDays === d ? theme.teal.solid : "transparent",
                  borderColor: durationDays === d ? theme.teal.solid : ink,
                }]}
              >
                <Text style={{ color: durationDays === d ? "#fff" : theme.textStrong, fontWeight: "700", fontSize: 14 }}>
                  {d} days
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 14, marginBottom: 8 }}>METRICS TO TRACK</Text>
          {AVAILABLE_METRICS.map(metric => {
            const checked = selectedMetrics.includes(metric);
            return (
              <Pressable key={metric} onPress={() => toggleMetric(metric)} style={s.checkRow}>
                <View style={[s.checkbox, { borderColor: checked ? theme.teal.solid : ink, backgroundColor: checked ? theme.teal.solid : "transparent" }]}>
                  {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
                <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "500" }}>{metric}</Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={handleCreate}
            disabled={creating}
            style={[s.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: ink, marginTop: 16, opacity: creating ? 0.6 : 1 }]}
          >
            {creating
              ? <LoadingIndicator size="small" color="#fff" />
              : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>Start Experiment</Text>}
          </Pressable>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    );
  }

  // ─── Results view ────────────────────────────────────────────────────────

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={s.content}>
      <Pressable onPress={() => { setView("list"); setResults(null); }} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <Ionicons name="chevron-back" size={16} color={theme.teal.solid} />
        <Text style={{ color: theme.teal.solid, fontSize: 13, fontWeight: "700" }}>Back</Text>
      </Pressable>

      <Text style={{ fontSize: 9, fontWeight: "900", letterSpacing: 0.6, color: theme.textSoft, marginBottom: 4 }}>RESULTS</Text>

      {resultsLoading ? (
        <View style={{ alignItems: "center", paddingTop: 40 }}>
          <LoadingIndicator size="large" color={theme.teal.solid} />
        </View>
      ) : !results ? (
        <View style={[s.card, { alignItems: "center", paddingVertical: 24 }]}>
          <Text style={{ color: theme.textSoft, fontSize: 14 }}>No results available yet.</Text>
        </View>
      ) : (
        <>
          {/* Header card */}
          <View style={s.card}>
            <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "900", lineHeight: 22, marginBottom: 4 }}>
              {results.experiment.description}
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: 12 }}>
              {fmtDateRange(results.experiment.start_date, results.experiment.end_date)}
            </Text>
          </View>

          {/* Not enough before data */}
          {!results.has_before_data && (
            <View style={[s.card, { backgroundColor: theme.amber?.tint ?? theme.card, borderColor: theme.amber?.solid ?? theme.cardBorder }]}>
              <Text style={{ color: theme.textStrong, fontSize: 13, lineHeight: 18 }}>
                Not enough data from before this experiment to compare.
              </Text>
            </View>
          )}

          {/* Per-metric rows */}
          {results.results && results.results.length > 0 && (
            <View style={s.card}>
              <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginBottom: 10 }}>BEFORE VS DURING</Text>
              {results.results.map((r, i) => {
                if (r.before_value === null && r.during_value === null) return null;
                const delta = deltaStr(r.before_value, r.during_value, r.metric);
                const metricLabel = r.metric === "tir" ? "Glucose TIR"
                  : r.metric === "sleep" ? "Sleep"
                  : r.metric === "mood" ? "Morning Mood"
                  : r.metric;
                return (
                  <View key={i} style={[s.resultRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.cardBorder, paddingTop: 10, marginTop: 6 }]}>
                    <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: "700", marginBottom: 4 }}>{metricLabel}</Text>
                    {!r.has_before_data ? (
                      <Text style={{ color: theme.textSoft, fontSize: 12, fontStyle: "italic" }}>No before-data available</Text>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "700" }}>
                          Before: {fmtMetricValue(r.before_value, r.metric)}
                        </Text>
                        <Ionicons name="arrow-forward" size={14} color={theme.textSoft} />
                        <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "700" }}>
                          During: {fmtMetricValue(r.during_value, r.metric)}
                        </Text>
                        {delta && (
                          <Text style={{ color: delta.color, fontSize: 13, fontWeight: "700" }}>{delta.text}</Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Hedge notice — always shown */}
          <View style={[s.card, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid + "40" }]}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ fontSize: 16 }}>💡</Text>
              <Text style={{ color: theme.teal.fg, fontSize: 13, lineHeight: 18, flex: 1 }}>
                {results.hedge ?? "Early signal — a short window like this can be affected by normal day-to-day variation."}
              </Text>
            </View>
          </View>
        </>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(ink: string, card: string, border: string) {
  const shadow = {
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12 as const,
    shadowRadius: 14,
    elevation: 4,
  };
  return StyleSheet.create({
    content:     { padding: 16, gap: 12, paddingBottom: 40 },
    card:        { borderRadius: 26, borderWidth: 2, padding: 16, backgroundColor: card, borderColor: border, ...shadow },
    newBtn:      { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 14, borderWidth: 2, paddingHorizontal: 12, paddingVertical: 6 },
    badge:       { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8, flexShrink: 0 },
    metricChip:  { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    primaryBtn:  { borderRadius: 20, borderWidth: 2, paddingVertical: 12, alignItems: "center", justifyContent: "center", ...shadow },
    textInput:   { borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontWeight: "500", backgroundColor: card },
    durationBtn: { flex: 1, borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center" },
    checkRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    checkbox:    { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    resultRow:   { marginBottom: 4 },
  });
}
