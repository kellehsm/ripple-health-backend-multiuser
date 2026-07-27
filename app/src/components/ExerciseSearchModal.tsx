import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TextInput, Pressable, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Image,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../api/client';
import { LoadingIndicator } from './LoadingIndicator';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

function CyclingImage({ images, style }: { images: string[]; style: any }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), 2000);
    return () => clearInterval(t);
  }, [images.length]);
  if (!images.length) {
    return <View style={[style, { backgroundColor: '#D8F5EB', opacity: 0.5 }]} />;
  }
  return <Image source={{ uri: IMAGE_BASE + images[idx] }} style={style} resizeMode="cover" />;
}

interface ExerciseResult {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
  primary_muscles: string[];
  images: string[];
}

interface LogForm {
  weight_used: string;
  target_rep_range_min: string;
  target_rep_range_max: string;
  sets_reps: string[];
  duration_minutes: string;
}

interface AddPayload {
  sets?: number;
  reps?: number;
  duration_seconds?: number;
  weight_used?: number;
  target_rep_range_min?: number;
  target_rep_range_max?: number;
  actual_reps_per_set?: number[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (exercise: ExerciseResult, form: AddPayload) => void;
  initialExercise?: ExerciseResult;
}

const CARDIO_CATEGORIES = ['cardio', 'stretching'];

const INITIAL_FORM: LogForm = {
  weight_used: '',
  target_rep_range_min: '',
  target_rep_range_max: '',
  sets_reps: ['', '', ''],
  duration_minutes: '',
};

export function ExerciseSearchModal({ visible, onClose, onAdd, initialExercise }: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ExerciseResult | null>(null);
  const [form, setForm] = useState<LogForm>(INITIAL_FORM);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      setSelected(null);
      setForm(INITIAL_FORM);
    } else if (initialExercise) {
      setSelected(initialExercise);
    }
  }, [visible]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      api.searchExerciseLibrary({ search: query, limit: 25 })
        .then(setResults)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const isCardio = selected ? CARDIO_CATEGORIES.includes(selected.category) : false;

  function handleAdd() {
    if (!selected) return;

    if (isCardio) {
      const duration_seconds = form.duration_minutes
        ? Math.round(parseFloat(form.duration_minutes) * 60) || undefined
        : undefined;
      onAdd(selected, { duration_seconds });
    } else {
      const filledReps = form.sets_reps.filter((r) => r.trim() !== '');
      const actual_reps_per_set = filledReps
        .map((r) => parseInt(r, 10))
        .filter((n) => !isNaN(n));
      const weight_used = form.weight_used ? parseFloat(form.weight_used) || undefined : undefined;
      const target_rep_range_min = form.target_rep_range_min
        ? parseInt(form.target_rep_range_min, 10) || undefined
        : undefined;
      const target_rep_range_max = form.target_rep_range_max
        ? parseInt(form.target_rep_range_max, 10) || undefined
        : undefined;
      onAdd(selected, {
        actual_reps_per_set: actual_reps_per_set.length > 0 ? actual_reps_per_set : undefined,
        sets: actual_reps_per_set.length > 0 ? actual_reps_per_set.length : undefined,
        weight_used,
        target_rep_range_min,
        target_rep_range_max,
      });
    }
    onClose();
  }

  function addSet() {
    setForm((f) => ({ ...f, sets_reps: [...f.sets_reps, ''] }));
  }

  function removeSet(index: number) {
    setForm((f) => ({
      ...f,
      sets_reps: f.sets_reps.filter((_, i) => i !== index),
    }));
  }

  function updateSetReps(index: number, value: string) {
    setForm((f) => {
      const next = [...f.sets_reps];
      next[index] = value;
      return { ...f, sets_reps: next };
    });
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.sheet, { backgroundColor: theme.page }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.cardBorder }]}>
          <Text style={[styles.headerTitle, { color: theme.textStrong }]}>
            {selected ? selected.name : 'Add exercise'}
          </Text>
          <Pressable onPress={selected ? () => setSelected(null) : onClose} style={styles.headerClose}>
            <Text style={{ color: ink, fontSize: 15, fontWeight: '700' }}>
              {selected ? '← Back' : 'Cancel'}
            </Text>
          </Pressable>
        </View>

        {selected ? (
          /* ── Log entry form ── */
          <ScrollView contentContainerStyle={styles.formContainer} keyboardShouldPersistTaps="handled">
            <View style={[styles.exerciseChip, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              {selected.images.length > 0 ? (
                <CyclingImage images={selected.images} style={styles.chipImage} />
              ) : (
                <View style={[styles.chipImagePlaceholder, { backgroundColor: theme.teal.tint }]}>
                  <Text style={{ fontSize: 40 }}>🏋️</Text>
                </View>
              )}
              <View style={{ padding: 14 }}>
                <Text style={[styles.chipName, { color: theme.textStrong }]}>{selected.name}</Text>
                {selected.primary_muscles.length > 0 && (
                  <Text style={[styles.chipMuscles, { color: theme.textSoft }]}>
                    {selected.primary_muscles.slice(0, 2).join(', ')}
                  </Text>
                )}
              </View>
            </View>

            {isCardio ? (
              /* Cardio: just duration */
              <>
                <Text style={[styles.formLabel, { color: theme.textSoft }]}>DURATION</Text>
                <View style={[styles.formField, { backgroundColor: theme.card, borderColor: ink }]}>
                  <Text style={[styles.formFieldLabel, { color: theme.textSoft }]}>Minutes</Text>
                  <TextInput
                    style={[styles.formFieldInput, { color: theme.textStrong }]}
                    value={form.duration_minutes}
                    onChangeText={(v) => setForm((f) => ({ ...f, duration_minutes: v }))}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={theme.textSoft}
                  />
                </View>
              </>
            ) : (
              /* Strength: weight + rep range + per-set reps */
              <>
                {/* Weight + Rep range row */}
                <View style={styles.topRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.formLabel, { color: theme.textSoft }]}>WEIGHT (lbs)</Text>
                    <View style={[styles.formField, { backgroundColor: theme.card, borderColor: ink }]}>
                      <TextInput
                        style={[styles.formFieldInput, { color: theme.textStrong }]}
                        value={form.weight_used}
                        onChangeText={(v) => setForm((f) => ({ ...f, weight_used: v }))}
                        keyboardType="decimal-pad"
                        placeholder="bw"
                        placeholderTextColor={theme.textSoft}
                      />
                    </View>
                  </View>

                  <View style={{ flex: 1.4 }}>
                    <Text style={[styles.formLabel, { color: theme.textSoft }]}>REP RANGE</Text>
                    <View style={styles.rangeRow}>
                      <View style={[styles.formField, { flex: 1, backgroundColor: theme.card, borderColor: ink }]}>
                        <TextInput
                          style={[styles.formFieldInput, { color: theme.textStrong }]}
                          value={form.target_rep_range_min}
                          onChangeText={(v) => setForm((f) => ({ ...f, target_rep_range_min: v }))}
                          keyboardType="numeric"
                          placeholder="8"
                          placeholderTextColor={theme.textSoft}
                        />
                      </View>
                      <Text style={[styles.rangeDash, { color: theme.textSoft }]}>—</Text>
                      <View style={[styles.formField, { flex: 1, backgroundColor: theme.card, borderColor: ink }]}>
                        <TextInput
                          style={[styles.formFieldInput, { color: theme.textStrong }]}
                          value={form.target_rep_range_max}
                          onChangeText={(v) => setForm((f) => ({ ...f, target_rep_range_max: v }))}
                          keyboardType="numeric"
                          placeholder="12"
                          placeholderTextColor={theme.textSoft}
                        />
                      </View>
                    </View>
                  </View>
                </View>

                {/* Per-set reps */}
                <Text style={[styles.formLabel, { color: theme.textSoft }]}>REPS PER SET</Text>
                {form.sets_reps.map((reps, i) => (
                  <View key={i} style={styles.setRow}>
                    <Text style={[styles.setLabel, { color: theme.textSoft }]}>Set {i + 1}</Text>
                    <View style={[styles.setField, { backgroundColor: theme.card, borderColor: ink }]}>
                      <TextInput
                        style={[styles.setInput, { color: theme.textStrong }]}
                        value={reps}
                        onChangeText={(v) => updateSetReps(i, v)}
                        keyboardType="numeric"
                        placeholder="—"
                        placeholderTextColor={theme.textSoft}
                      />
                    </View>
                    {form.sets_reps.length > 1 && (
                      <Pressable onPress={() => removeSet(i)} style={styles.removeBtn} hitSlop={8}>
                        <Text style={{ color: theme.textSoft, fontSize: 18, lineHeight: 20 }}>×</Text>
                      </Pressable>
                    )}
                  </View>
                ))}

                <Pressable
                  onPress={addSet}
                  style={[styles.addSetBtn, { borderColor: theme.cardBorder }]}
                >
                  <Text style={{ color: ink, fontWeight: '700', fontSize: 14 }}>+ Add set</Text>
                </Pressable>
              </>
            )}

            <Pressable
              onPress={handleAdd}
              style={[styles.addBtn, { backgroundColor: ink, borderColor: ink, shadowColor: "rgba(60,40,20,0.1)" }]}
            >
              <Text style={[styles.addBtnText, { color: theme.page }]}>Log exercise</Text>
            </Pressable>
          </ScrollView>
        ) : (
          /* ── Search list ── */
          <>
            <View style={[styles.searchBar, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
              <TextInput
                style={[styles.searchInput, { color: theme.textStrong }]}
                value={query}
                onChangeText={setQuery}
                placeholder="Search exercises…"
                placeholderTextColor={theme.textSoft}
                autoFocus
                returnKeyType="search"
              />
              {loading && <LoadingIndicator size="small" />}
            </View>

            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 32 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelected(item)}
                  style={[styles.resultRow, { borderBottomColor: theme.cardBorder }]}
                >
                  {item.images.length > 0 ? (
                    <Image
                      source={{ uri: IMAGE_BASE + item.images[0] }}
                      style={styles.resultThumb}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.resultThumb, styles.resultThumbPlaceholder, { backgroundColor: theme.teal.tint }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.resultName, { color: theme.textStrong }]}>{item.name}</Text>
                    <Text style={[styles.resultMeta, { color: theme.textSoft }]}>
                      {[item.category, item.equipment, item.primary_muscles[0]].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSoft, fontSize: 16 }}>›</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                !loading ? (
                  <Text style={[styles.emptyMsg, { color: theme.textSoft }]}>
                    {query ? 'No exercises found' : 'Start typing to search'}
                  </Text>
                ) : null
              }
            />
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', flex: 1 },
  headerClose: { padding: 4 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 16 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  resultThumb: {
    width: 88,
    height: 88,
    borderRadius: 14,
  },
  resultThumbPlaceholder: {
    opacity: 0.4,
  },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultMeta: { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  emptyMsg: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  formContainer: { padding: 16, gap: 12, paddingBottom: 40 },
  exerciseChip: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  chipImage: {
    width: '100%',
    height: 260,
  },
  chipImagePlaceholder: {
    width: '100%',
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipName: { fontSize: 15, fontWeight: '700' },
  chipMuscles: { fontSize: 12, textTransform: 'capitalize', marginTop: 2 },
  formLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rangeDash: { fontSize: 18, fontWeight: '600', marginBottom: 2 },
  formField: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 12,
  },
  formFieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  formFieldInput: { fontSize: 22, fontWeight: '800' },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  setLabel: { fontSize: 12, fontWeight: '700', width: 40, letterSpacing: 0.4 },
  setField: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  setInput: { fontSize: 20, fontWeight: '800' },
  removeBtn: { padding: 4 },
  addSetBtn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  addBtn: {
    borderRadius: 26,
    borderWidth: 2,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  addBtnText: { fontSize: 16, fontWeight: '800' },
});
