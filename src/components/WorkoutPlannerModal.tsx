import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, Pressable, ScrollView, TextInput, FlatList,
  Image, StyleSheet, Platform, KeyboardAvoidingView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../api/client';
import { LoadingIndicator } from './LoadingIndicator';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export interface PlanExercise {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
  primary_muscles: string[];
  images: string[];
}

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

interface Props {
  visible: boolean;
  onClose: () => void;
  onBegin: (queue: PlanExercise[]) => Promise<void>;
  initialQueue?: PlanExercise[];
}

export function WorkoutPlannerModal({ visible, onClose, onBegin, initialQueue }: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;

  const [view, setView] = useState<'queue' | 'search'>('queue');
  const [queue, setQueue] = useState<PlanExercise[]>([]);
  const [starting, setStarting] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlanExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setView('queue');
      setQueue([]);
      setQuery('');
      setResults([]);
      setStarting(false);
    } else {
      setQueue(initialQueue ?? []);
    }
  }, [visible]);

  useEffect(() => {
    if (view !== 'search') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      api.searchExerciseLibrary({ search: query, limit: 25 })
        .then(setResults)
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, view]);

  function handleAddExercise(exercise: PlanExercise) {
    setQueue(q => [...q, exercise]);
    setView('queue');
    setQuery('');
    setResults([]);
  }

  function handleRemove(idx: number) {
    setQueue(q => q.filter((_, i) => i !== idx));
  }

  async function handleBegin() {
    setStarting(true);
    try {
      await onBegin(queue);
    } catch {
      Alert.alert('Error', 'Could not start workout. Try again.');
      setStarting(false);
    }
  }

  const estMinutes = queue.length * 8;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.page }}>
        {view === 'search' ? (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Search header */}
            <View style={[s.header, { borderBottomColor: theme.cardBorder }]}>
              <Pressable onPress={() => { setView('queue'); setQuery(''); }} hitSlop={12}>
                <Text style={{ color: ink, fontSize: 15, fontWeight: '700' }}>← Back</Text>
              </Pressable>
              <Text style={[s.headerTitle, { color: theme.textStrong }]}>Add exercise</Text>
              <View style={{ width: 60 }} />
            </View>

            <View style={[s.searchBar, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
              <TextInput
                style={[s.searchInput, { color: theme.textStrong }]}
                value={query}
                onChangeText={setQuery}
                placeholder="Search exercises…"
                placeholderTextColor={theme.textSoft}
                autoFocus
                returnKeyType="search"
              />
              {searching && <LoadingIndicator size="small" />}
            </View>

            <FlatList
              data={results}
              keyExtractor={(item, i) => `${item.id}-${i}`}
              contentContainerStyle={{ paddingBottom: 32 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleAddExercise(item)}
                  style={[s.resultRow, { borderBottomColor: theme.cardBorder }]}
                >
                  {item.images.length > 0 ? (
                    <Image source={{ uri: IMAGE_BASE + item.images[0] }} style={s.resultThumb} resizeMode="cover" />
                  ) : (
                    <View style={[s.resultThumb, { backgroundColor: theme.teal.tint, opacity: 0.5, borderRadius: 14 }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.resultName, { color: theme.textStrong }]}>{item.name}</Text>
                    <Text style={[s.resultMeta, { color: theme.textSoft }]}>
                      {[item.category, item.equipment, item.primary_muscles[0]].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={[s.addChip, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                    <Text style={{ color: theme.teal.sub, fontWeight: '800', fontSize: 13 }}>+ Add</Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                !searching ? (
                  <Text style={[s.emptyMsg, { color: theme.textSoft }]}>
                    {query ? 'No exercises found' : 'Start typing to search'}
                  </Text>
                ) : null
              }
            />
          </KeyboardAvoidingView>
        ) : (
          /* Queue view */
          <>
            <View style={[s.header, { borderBottomColor: theme.cardBorder }]}>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ color: ink, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Text style={[s.headerTitle, { color: theme.textStrong }]}>Plan your workout</Text>
              <View style={{ width: 60 }} />
            </View>

            {/* Stat strip — mirrors ExerciseDetail's header card */}
            <View style={[s.statCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={s.stat}>
                <Text style={[s.statValue, { color: ink }]}>{queue.length}</Text>
                <Text style={[s.statLabel, { color: theme.textSoft }]}>EXERCISES</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: theme.cardBorder }]} />
              <View style={s.stat}>
                <Text style={[s.statValue, { color: ink }]}>
                  {queue.length > 0 ? `~${estMinutes}m` : '—'}
                </Text>
                <Text style={[s.statLabel, { color: theme.textSoft }]}>EST. TIME</Text>
              </View>
              <View style={[s.statDivider, { backgroundColor: theme.cardBorder }]} />
              <View style={s.stat}>
                <Text style={[s.statValue, { color: ink }]}>
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={[s.statLabel, { color: theme.textSoft }]}>NOW</Text>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 130 }}
              showsVerticalScrollIndicator={false}
            >
              {queue.length === 0 ? (
                <View style={s.empty}>
                  <Text style={{ fontSize: 48 }}>🏋️</Text>
                  <Text style={[s.emptyTitle, { color: theme.textStrong }]}>No exercises planned</Text>
                  <Text style={[s.emptySub, { color: theme.textSoft }]}>
                    Add exercises below to build your workout,{'\n'}or begin now and log as you go.
                  </Text>
                </View>
              ) : (
                queue.map((ex, i) => (
                  <View
                    key={`${ex.id}-${i}`}
                    style={[s.exerciseCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  >
                    <CyclingImage images={ex.images} style={s.exerciseImage} />
                    <View style={s.exerciseCardBody}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[s.exerciseName, { color: theme.textStrong }]}>{ex.name}</Text>
                        {ex.primary_muscles.length > 0 && (
                          <Text style={[s.exerciseMuscles, { color: theme.textSoft }]}>
                            {ex.primary_muscles.slice(0, 3).join(', ')}
                          </Text>
                        )}
                        {ex.category ? (
                          <Text style={{ color: theme.teal.fg ?? theme.textSoft, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {ex.category}
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => handleRemove(i)}
                        hitSlop={10}
                        style={[s.removeBtn, { borderColor: theme.cardBorder }]}
                      >
                        <Text style={{ color: theme.textSoft, fontSize: 18, lineHeight: 22 }}>×</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[s.footer, { borderTopColor: theme.cardBorder, backgroundColor: theme.page }]}>
              <Pressable
                onPress={() => setView('search')}
                style={[s.addBtn, { borderColor: ink }]}
              >
                <Text style={[s.addBtnText, { color: ink }]}>+ Add exercise</Text>
              </Pressable>
              <Pressable
                onPress={handleBegin}
                disabled={starting}
                style={[s.beginBtn, { backgroundColor: ink, borderColor: ink }]}
              >
                {starting
                  ? <LoadingIndicator color="#fff" size="small" />
                  : <Text style={s.beginBtnText}>🏃  Begin Workout</Text>
                }
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', flex: 1, textAlign: 'center' },
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
  resultThumb: { width: 72, height: 72, borderRadius: 12 },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultMeta: { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  addChip: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  emptyMsg: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  statCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 26,
    borderWidth: 2,
    padding: 16,
    shadowColor: 'rgba(60,40,20,0.1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 3,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  statDivider: { width: 1, marginVertical: 2 },
  empty: { paddingTop: 48, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginTop: 4 },
  exerciseCard: {
    borderRadius: 22,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: 'rgba(60,40,20,0.1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 3,
  },
  exerciseImage: { width: '100%', height: 200 },
  exerciseCardBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    gap: 10,
  },
  exerciseName: { fontSize: 15, fontWeight: '700' },
  exerciseMuscles: { fontSize: 12, textTransform: 'capitalize' },
  removeBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 28,
    gap: 10,
    borderTopWidth: 1,
  },
  addBtn: {
    borderRadius: 26,
    borderWidth: 2,
    paddingVertical: 13,
    alignItems: 'center',
  },
  addBtnText: { fontSize: 15, fontWeight: '700' },
  beginBtn: {
    borderRadius: 26,
    borderWidth: 2,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: 'rgba(60,40,20,0.1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  beginBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
