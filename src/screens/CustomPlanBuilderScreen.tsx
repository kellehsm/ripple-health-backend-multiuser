import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, Alert, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { toast } from "../lib/toast";
import { onSolid } from "../theme/colorUtils";

const FOCUS_OPTIONS = [
  { key: "full_body", label: "Full body" },
  { key: "upper",     label: "Upper" },
  { key: "lower",     label: "Lower" },
  { key: "push",      label: "Push" },
  { key: "pull",      label: "Pull" },
  { key: "legs",      label: "Legs" },
  { key: "core",      label: "Core" },
  { key: "cardio",    label: "Cardio" },
];

type LibraryExercise = {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
  primary_muscles: string[];
};

type PlanExercise = {
  exercise_id: string;
  name: string;
  sets: number;
  rep_range_min: number;
  rep_range_max: number;
};

type PlanDay = {
  focus: string;
  exercises: PlanExercise[];
};

export function CustomPlanBuilderScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const ink = theme.ink;

  const [name, setName] = useState("My Plan");
  const [days, setDays] = useState<PlanDay[]>([{ focus: "full_body", exercises: [] }]);
  const [saving, setSaving] = useState(false);

  // Exercise picker
  const [pickerFor, setPickerFor] = useState<number | null>(null); // day index
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerResults, setPickerResults] = useState<LibraryExercise[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  useEffect(() => {
    if (pickerFor === null) return;
    let cancelled = false;
    setPickerLoading(true);
    const t = setTimeout(() => {
      api.searchExerciseLibrary({ search: pickerQuery.trim(), limit: 30 })
        .then((rows: any) => { if (!cancelled) setPickerResults(Array.isArray(rows) ? rows : []); })
        .catch(() => { if (!cancelled) setPickerResults([]); })
        .finally(() => { if (!cancelled) setPickerLoading(false); });
    }, pickerQuery ? 300 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [pickerFor, pickerQuery]);

  function addDay() {
    if (days.length >= 7) return;
    setDays((prev) => [...prev, { focus: "full_body", exercises: [] }]);
  }

  function removeDay(idx: number) {
    setDays((prev) => prev.filter((_, i) => i !== idx));
  }

  function setDayFocus(idx: number, focus: string) {
    setDays((prev) => prev.map((d, i) => i === idx ? { ...d, focus } : d));
  }

  function removeExercise(dayIdx: number, exIdx: number) {
    setDays((prev) => prev.map((d, i) => i === dayIdx ? { ...d, exercises: d.exercises.filter((_, j) => j !== exIdx) } : d));
  }

  function pickExercise(ex: LibraryExercise) {
    if (pickerFor === null) return;
    setDays((prev) => prev.map((d, i) => i === pickerFor ? {
      ...d,
      exercises: [...d.exercises, { exercise_id: ex.id, name: ex.name, sets: 3, rep_range_min: 8, rep_range_max: 12 }],
    } : d));
    setPickerFor(null);
    setPickerQuery("");
  }

  function updateEx(dayIdx: number, exIdx: number, patch: Partial<PlanExercise>) {
    setDays((prev) => prev.map((d, i) => i === dayIdx ? {
      ...d,
      exercises: d.exercises.map((e, j) => j === exIdx ? { ...e, ...patch } : e),
    } : d));
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert("Missing name", "Give your plan a name first."); return; }
    if (days.every((d) => d.exercises.length === 0)) {
      Alert.alert("No exercises", "Add at least one exercise to any day before saving.");
      return;
    }
    setSaving(true);
    try {
      await api.createCustomWorkoutProgram({
        name: name.trim(),
        days: days.map((d) => ({
          focus: d.focus,
          exercises: d.exercises.map((e) => ({
            exercise_id: e.exercise_id,
            sets: e.sets,
            rep_range_min: e.rep_range_min,
            rep_range_max: e.rep_range_max,
          })),
        })),
      });
      toast("Plan saved.");
      navigation.goBack();
    } catch {
      toast("Couldn't save that plan. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}>
        <Text style={[styles.label, { color: theme.textSoft }]}>PLAN NAME</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="My Plan"
          placeholderTextColor={theme.textSoft}
          style={[styles.input, { color: theme.textStrong, borderColor: ink, backgroundColor: theme.card }]}
        />

        {days.map((day, i) => (
          <View key={i} style={[styles.dayCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: theme.textStrong, fontWeight: "900", fontSize: 15 }}>Day {i + 1}</Text>
              {days.length > 1 && (
                <Pressable onPress={() => removeDay(i)} hitSlop={8} accessibilityLabel={`Remove day ${i + 1}`}>
                  <Ionicons name="close-circle" size={20} color={theme.coral.solid} />
                </Pressable>
              )}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {FOCUS_OPTIONS.map((f) => {
                const on = day.focus === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setDayFocus(i, f.key)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: on ? theme.teal.solid : theme.cardBorder,
                      backgroundColor: on ? theme.teal.tint : "transparent",
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={{ color: on ? theme.teal.fg : theme.textStrong, fontSize: 11, fontWeight: "700" }}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {day.exercises.length > 0 && (
              <View style={{ marginTop: 10, gap: 6 }}>
                {day.exercises.map((ex, j) => (
                  <View key={j} style={[styles.exerciseRow, { borderColor: theme.cardBorder }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: 13 }}>{ex.name}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                        <TextInput
                          value={String(ex.sets)}
                          onChangeText={(v) => updateEx(i, j, { sets: parseInt(v, 10) || 1 })}
                          keyboardType="numeric"
                          style={[styles.miniInput, { color: theme.textStrong, borderColor: theme.cardBorder }]}
                        />
                        <Text style={{ color: theme.textSoft, fontSize: 11 }}>sets ·</Text>
                        <TextInput
                          value={String(ex.rep_range_min)}
                          onChangeText={(v) => updateEx(i, j, { rep_range_min: parseInt(v, 10) || 1 })}
                          keyboardType="numeric"
                          style={[styles.miniInput, { color: theme.textStrong, borderColor: theme.cardBorder }]}
                        />
                        <Text style={{ color: theme.textSoft, fontSize: 11 }}>–</Text>
                        <TextInput
                          value={String(ex.rep_range_max)}
                          onChangeText={(v) => updateEx(i, j, { rep_range_max: parseInt(v, 10) || 1 })}
                          keyboardType="numeric"
                          style={[styles.miniInput, { color: theme.textStrong, borderColor: theme.cardBorder }]}
                        />
                        <Text style={{ color: theme.textSoft, fontSize: 11 }}>reps</Text>
                      </View>
                    </View>
                    <Pressable onPress={() => removeExercise(i, j)} hitSlop={8} accessibilityLabel={`Remove ${ex.name}`}>
                      <Ionicons name="trash-outline" size={16} color={theme.textSoft} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              onPress={() => { setPickerFor(i); setPickerQuery(""); setPickerResults([]); }}
              style={[styles.addBtn, { borderColor: theme.teal.solid }]}
              accessibilityLabel="Add an exercise to this day"
            >
              <Ionicons name="add" size={16} color={theme.teal.solid} />
              <Text style={{ color: theme.teal.solid, fontWeight: "700", fontSize: 13 }}>Add exercise</Text>
            </Pressable>
          </View>
        ))}

        {days.length < 7 && (
          <Pressable
            onPress={addDay}
            style={[styles.addDayBtn, { borderColor: theme.cardBorder }]}
            accessibilityLabel="Add another day"
          >
            <Ionicons name="add-circle-outline" size={20} color={theme.teal.solid} />
            <Text style={{ color: theme.teal.solid, fontWeight: "700", fontSize: 14 }}>Add another day</Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Save bar */}
      <View style={[styles.saveBar, { backgroundColor: theme.card, borderTopColor: theme.cardBorder }]}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, { backgroundColor: theme.teal.solid, borderColor: ink, opacity: saving ? 0.6 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Save this plan"
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: onSolid(theme.teal.solid), fontWeight: "900", fontSize: 15, letterSpacing: 0.3 }}>SAVE PLAN</Text>}
        </Pressable>
      </View>

      {/* Exercise picker modal */}
      <Modal visible={pickerFor !== null} animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <View style={{ flex: 1, backgroundColor: theme.page }}>
          <View style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TextInput
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder="Search exercises..."
              placeholderTextColor={theme.textSoft}
              autoFocus
              style={[styles.input, { flex: 1, color: theme.textStrong, borderColor: ink, backgroundColor: theme.card }]}
            />
            <Pressable onPress={() => setPickerFor(null)} hitSlop={12}>
              <Text style={{ color: theme.textSoft, fontSize: 18 }}>✕</Text>
            </Pressable>
          </View>
          {pickerLoading ? (
            <View style={{ padding: 40, alignItems: "center" }}>
              <ActivityIndicator color={theme.teal.solid} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, gap: 6 }}>
              {pickerResults.map((ex) => (
                <Pressable
                  key={ex.id}
                  onPress={() => pickExercise(ex)}
                  style={[styles.pickRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  accessibilityLabel={"Add " + ex.name}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: 14 }}>{ex.name}</Text>
                    <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
                      {(ex.primary_muscles ?? []).slice(0, 2).join(", ")}
                      {ex.equipment ? "  ·  " + ex.equipment : ""}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={22} color={theme.teal.solid} />
                </Pressable>
              ))}
              {pickerResults.length === 0 && !pickerLoading && (
                <Text style={{ color: theme.textSoft, textAlign: "center", padding: 24 }}>
                  {pickerQuery ? "No exercises match that search." : "Start typing to search."}
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  input: {
    borderWidth: 2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  dayCard: {
    borderWidth: 2, borderRadius: 18, padding: 14, gap: 4,
  },
  exerciseRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8,
  },
  miniInput: {
    width: 36, borderWidth: 1.5, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 6,
    fontSize: 12, textAlign: "center",
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderStyle: "dashed", borderRadius: 12, paddingVertical: 10, marginTop: 8,
  },
  addDayBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1.5, borderStyle: "dashed", borderRadius: 14, paddingVertical: 14,
  },
  saveBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: 14, borderTopWidth: 2,
  },
  saveBtn: {
    borderWidth: 2, borderRadius: 16, paddingVertical: 14, alignItems: "center",
  },
  pickRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1.5, borderRadius: 14, padding: 12,
  },
});
