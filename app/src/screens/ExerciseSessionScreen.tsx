import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert, Image, Animated, Dimensions,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../api/client';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ExerciseSearchModal } from '../components/ExerciseSearchModal';
import { PlanExercise } from '../components/WorkoutPlannerModal';
import { fireRestTimerDone } from '../lib/smartNotifications';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

function CyclingImage({ images, style }: { images: string[]; style: any }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), 2000);
    return () => clearInterval(t);
  }, [images.length]);
  if (!images.length) return <View style={[style, { backgroundColor: '#D8F5EB', opacity: 0.4, borderRadius: 14 }]} />;
  return <Image source={{ uri: IMAGE_BASE + images[idx] }} style={[style, { borderRadius: 14 }]} resizeMode="cover" />;
}

interface LogEntry {
  id: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  logged_at: string;
  sort_order: number;
  weight_used: number | null;
  target_rep_range_min: number | null;
  target_rep_range_max: number | null;
  actual_reps_per_set: number[] | null;
  all_sets_maxed: boolean | null;
  exercise: {
    id: string;
    name: string;
    category: string;
    equipment: string | null;
    primary_muscles: string[];
  };
}

interface ActiveExercise {
  name: string;
  images: string[];
  primary_muscles: string[];
  category: string;
}

function formatSecs(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function entryLabel(entry: LogEntry): string {
  const wt = entry.weight_used ? ` @ ${entry.weight_used} lbs` : '';
  if (entry.actual_reps_per_set && entry.actual_reps_per_set.length > 0) {
    const arr = entry.actual_reps_per_set;
    const allSame = arr.every((r) => r === arr[0]);
    if (allSame) return `${arr.length} × ${arr[0]} reps${wt}`;
    return `${arr.join('/')} reps${wt}`;
  }
  if (entry.sets && entry.reps) return `${entry.sets} × ${entry.reps} reps${wt}`;
  if (entry.sets) return `${entry.sets} set${entry.sets > 1 ? 's' : ''}${wt}`;
  if (entry.duration_seconds) {
    const m = Math.floor(entry.duration_seconds / 60);
    const s = entry.duration_seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return 'Logged';
}

const REST_OPTIONS = [30, 60, 90, 120];
const SCREEN_W = Dimensions.get('window').width;

function HRSparkline({ readings, color }: { readings: Array<{ bpm: number }>; color: string }) {
  const W = SCREEN_W - 140;
  const H = 28;
  const bpms = readings.map(r => r.bpm);
  const min = Math.min(...bpms);
  const max = Math.max(...bpms);
  const range = max - min || 1;
  const pts = bpms.map((b, i) => {
    const x = (i / (bpms.length - 1)) * W;
    const y = H - ((b - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Svg width={W} height={H} style={{ marginTop: 6 }}>
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.8} />
    </Svg>
  );
}

export function ExerciseSessionScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { sessionId, plannedExercises: initialPlan } = route.params as {
    sessionId: string;
    plannedExercises?: PlanExercise[];
  };
  const ink = theme.ink;

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [searchVisible, setSearchVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Planned exercises from pre-session planner
  const [planned, setPlanned] = useState<PlanExercise[]>(initialPlan ?? []);
  const [logTarget, setLogTarget] = useState<PlanExercise | null>(null);

  // Timer — only runs after user taps Start
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState('00:00');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startEpochRef = useRef<number | null>(null);

  // Currently active exercise (most recently logged)
  const [activeExercise, setActiveExercise] = useState<ActiveExercise | null>(null);

  // Rest timer
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live heart rate — full session accumulation
  const [sessionHR, setSessionHR] = useState<Array<{ recorded_at: string; bpm: number }>>([]);
  const hrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const liveHR = sessionHR.length > 0 ? sessionHR[sessionHR.length - 1].bpm : null;
  const peakHR = sessionHR.length > 0 ? Math.max(...sessionHR.map(r => r.bpm)) : null;

  // Session end celebration
  const [celebrating, setCelebrating] = useState(false);
  const [celebStats, setCelebStats] = useState<{ exercises: number; sets: number; duration: string; peakHR: number | null } | null>(null);
  const celebOpacity = useRef(new Animated.Value(0)).current;

  const loadSession = useCallback(async () => {
    try {
      const s = await api.getExerciseSession(sessionId);
      setEntries(s.entries ?? []);
    } catch {
      Alert.alert('Error', 'Could not load session.');
    } finally {
      setLoadingEntries(false);
    }
  }, [sessionId]);

  useFocusEffect(useCallback(() => {
    loadSession();
  }, [loadSession]));

  useEffect(() => () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (restTimerRef.current) { clearInterval(restTimerRef.current); restTimerRef.current = null; }
    if (hrPollRef.current) { clearInterval(hrPollRef.current); hrPollRef.current = null; }
  }, []);

  async function pollHR() {
    if (!startEpochRef.current) return;
    try {
      const start = new Date(startEpochRef.current).toISOString();
      const end = new Date().toISOString();
      const readings = await api.heartRateRange(start, end);
      if (Array.isArray(readings) && readings.length > 0) {
        setSessionHR(readings);
      }
    } catch {}
  }

  function handleStartWorkout() {
    if (started || timerRef.current) return;
    setStarted(true);
    startEpochRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (!startEpochRef.current) return;
      const secs = Math.floor((Date.now() - startEpochRef.current) / 1000);
      setElapsed(formatSecs(secs));
    }, 1000);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    pollHR();
    hrPollRef.current = setInterval(pollHR, 1000);
  }

  const restElapsedRef = useRef(0);
  function startRestTimer(secs: number) {
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restElapsedRef.current = 0;
    setRestSeconds(secs);
    restTimerRef.current = setInterval(() => {
      restElapsedRef.current += 1;
      if (restElapsedRef.current % 10 === 0) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      setRestSeconds(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(restTimerRef.current!);
          restTimerRef.current = null;
          fireRestTimerDone().catch(() => {});
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function dismissRest() {
    if (restTimerRef.current) { clearInterval(restTimerRef.current); restTimerRef.current = null; }
    setRestSeconds(null);
  }

  async function handleAdd(exercise: any, form: {
    sets?: number; reps?: number; duration_seconds?: number;
    weight_used?: number; target_rep_range_min?: number; target_rep_range_max?: number;
    actual_reps_per_set?: number[];
  }) {
    try {
      await api.addExerciseEntry(sessionId, { exercise_id: exercise.id, ...form });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setActiveExercise({
        name: exercise.name,
        images: exercise.images ?? [],
        primary_muscles: exercise.primary_muscles ?? [],
        category: exercise.category ?? '',
      });
      setPlanned(prev => {
        const idx = prev.findIndex(p => p.id === exercise.id);
        if (idx === -1) return prev;
        return prev.filter((_, i) => i !== idx);
      });
      setLogTarget(null);
      await loadSession();
      startRestTimer(60);
    } catch {
      Alert.alert('Error', 'Could not log exercise.');
    }
  }

  async function handleDeleteEntry(entryId: string) {
    Alert.alert('Remove', 'Remove this exercise from the session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.deleteExerciseEntry(entryId);
            setEntries((prev) => prev.filter((e) => e.id !== entryId));
          } catch {
            Alert.alert('Error', 'Could not remove entry.');
          }
        },
      },
    ]);
  }

  async function handleFinish() {
    Alert.alert('Finish workout', 'End this session?', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Finish', onPress: async () => {
          setFinishing(true);
          try {
            await api.finishExerciseSession(sessionId);
            if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
            if (hrPollRef.current) { clearInterval(hrPollRef.current); hrPollRef.current = null; }
            const uniqueExercises = new Set(entries.map(e => e.exercise.id)).size;
            const totalSets = entries.reduce((sum, e) => sum + (e.sets ?? 1), 0);
            const durationSecs = startEpochRef.current ? Math.floor((Date.now() - startEpochRef.current) / 1000) : 0;
            setCelebStats({ exercises: uniqueExercises, sets: totalSets, duration: formatSecs(durationSecs), peakHR });
            setCelebrating(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            celebOpacity.setValue(0);
            Animated.timing(celebOpacity, { toValue: 1, duration: 300, useNativeDriver: true }).start();
            setTimeout(() => {
              Animated.timing(celebOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
                setCelebrating(false);
                navigation.replace('ExerciseDetail', { sessionId });
              });
            }, 2200);
          } catch {
            Alert.alert('Error', 'Could not finish session.');
            setFinishing(false);
          }
        },
      },
    ]);
  }

  function handleLogPlanned(exercise: PlanExercise) {
    setLogTarget(exercise);
    setSearchVisible(true);
  }

  if (celebrating && celebStats) {
    return (
      <Animated.View style={[styles.celebContainer, { backgroundColor: theme.teal.tint, opacity: celebOpacity }]}>
        <Text style={[styles.celebEmoji]}>🏋️</Text>
        <Text style={[styles.celebTitle, { color: theme.teal.sub }]}>Workout complete!</Text>
        <View style={styles.celebStats}>
          <View style={styles.celebStat}>
            <Text style={[styles.celebStatVal, { color: theme.teal.sub }]}>{celebStats.exercises}</Text>
            <Text style={[styles.celebStatLabel, { color: theme.teal.fg }]}>EXERCISES</Text>
          </View>
          <View style={styles.celebStat}>
            <Text style={[styles.celebStatVal, { color: theme.teal.sub }]}>{celebStats.sets}</Text>
            <Text style={[styles.celebStatLabel, { color: theme.teal.fg }]}>SETS</Text>
          </View>
          <View style={styles.celebStat}>
            <Text style={[styles.celebStatVal, { color: theme.teal.sub }]}>{celebStats.duration}</Text>
            <Text style={[styles.celebStatLabel, { color: theme.teal.fg }]}>TIME</Text>
          </View>
          {celebStats.peakHR && (
            <View style={styles.celebStat}>
              <Text style={[styles.celebStatVal, { color: theme.coral.solid }]}>{celebStats.peakHR}</Text>
              <Text style={[styles.celebStatLabel, { color: theme.teal.fg }]}>PEAK BPM</Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.page }]}>
      {/* Timer bar */}
      <View style={[styles.timerBar, { backgroundColor: theme.card, borderBottomColor: ink }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
            <View>
              <Text style={[styles.timerLabel, { color: theme.textSoft }]}>SESSION TIME</Text>
              <Text style={[styles.timer, { color: ink }]}>{elapsed}</Text>
            </View>
            {liveHR && (
              <View style={{ paddingBottom: 4 }}>
                <Text style={[styles.timerLabel, { color: theme.textSoft }]}>HEART RATE</Text>
                <Text style={[styles.liveHRBig, { color: theme.coral.solid }]}>
                  ♥ {liveHR} <Text style={{ fontSize: 14 }}>bpm</Text>
                </Text>
                {peakHR && (
                  <Text style={[styles.peakHRLabel, { color: theme.textSoft }]}>peak {peakHR}</Text>
                )}
              </View>
            )}
          </View>
          {sessionHR.length >= 3 && (
            <HRSparkline readings={sessionHR} color={theme.coral.solid} />
          )}
        </View>
        {!started ? (
          <Pressable
            onPress={handleStartWorkout}
            style={[styles.startBtn, { backgroundColor: theme.teal.solid, borderColor: ink }]}
          >
            <Text style={styles.startBtnText}>▶  Start</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleFinish}
            disabled={finishing}
            style={[styles.finishBtn, { backgroundColor: theme.coral.solid, borderColor: ink }]}
          >
            {finishing
              ? <LoadingIndicator color="#fff" size="small" />
              : <Text style={styles.finishBtnText}>Finish</Text>
            }
          </Pressable>
        )}
      </View>

      {/* Active exercise card */}
      {activeExercise && restSeconds === null && (
        <View style={[styles.activeCard, { backgroundColor: theme.card, borderColor: theme.teal.solid ?? ink }]}>
          <CyclingImage images={activeExercise.images} style={styles.activeImage} />
          <View style={styles.activeInfo}>
            <Text style={[styles.activeName, { color: theme.textStrong }]} numberOfLines={2}>
              {activeExercise.name}
            </Text>
            {activeExercise.primary_muscles.length > 0 && (
              <Text style={[styles.activeMuscles, { color: theme.textSoft }]} numberOfLines={1}>
                {activeExercise.primary_muscles.join(', ')}
              </Text>
            )}
            {activeExercise.category ? (
              <Text style={[styles.activeCategory, { color: theme.teal.fg ?? theme.textSoft }]}>
                {activeExercise.category}
              </Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Rest timer banner */}
      {restSeconds !== null && (
        <View style={[styles.restBanner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.restLabel, { color: theme.teal.sub }]}>REST</Text>
            <Text style={[styles.restTimer, { color: theme.teal.sub }]}>{formatSecs(restSeconds)}</Text>
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {REST_OPTIONS.map(opt => (
                <Pressable
                  key={opt}
                  onPress={() => startRestTimer(opt)}
                  style={[styles.restOption, {
                    backgroundColor: theme.teal.solid,
                    borderColor: theme.teal.solid,
                  }]}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{opt}s</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={dismissRest} style={[styles.restDismiss, { borderColor: theme.teal.solid }]}>
              <Text style={{ color: theme.teal.sub, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
                Done resting
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Planned exercises section */}
        {planned.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>YOUR PLAN</Text>
            {planned.map((ex, i) => (
              <Pressable
                key={`${ex.id}-${i}`}
                onPress={() => handleLogPlanned(ex)}
                style={[styles.plannedCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              >
                <CyclingImage images={ex.images} style={styles.plannedImage} />
                <View style={styles.plannedInfo}>
                  <Text style={[styles.plannedName, { color: theme.textStrong }]} numberOfLines={2}>
                    {ex.name}
                  </Text>
                  {ex.primary_muscles.length > 0 && (
                    <Text style={[styles.plannedMuscles, { color: theme.textSoft }]} numberOfLines={1}>
                      {ex.primary_muscles.slice(0, 3).join(', ')}
                    </Text>
                  )}
                  <View style={[styles.logChip, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                    <Text style={{ color: theme.teal.sub, fontSize: 12, fontWeight: '700' }}>Tap to log</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </>
        )}

        {/* Logged entries */}
        {loadingEntries ? (
          <View style={styles.center}><LoadingIndicator /></View>
        ) : entries.length > 0 ? (
          <>
            {planned.length > 0 && (
              <Text style={[styles.sectionLabel, { color: theme.textSoft, marginTop: 4 }]}>LOGGED</Text>
            )}
            {entries.map((entry) => (
              <Pressable
                key={entry.id}
                onLongPress={() => handleDeleteEntry(entry.id)}
                style={[styles.entryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.entryName, { color: theme.textStrong }]}>{entry.exercise.name}</Text>
                  <Text style={[styles.entryDetail, { color: theme.teal.fg }]}>{entryLabel(entry)}</Text>
                </View>
                <Text style={{ color: theme.textSoft, fontSize: 11 }}>hold to remove</Text>
              </Pressable>
            ))}
          </>
        ) : planned.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: theme.textSoft }]}>
              Tap "+ Add exercise" below to log your first set.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Add button */}
      <View style={[styles.footer, { borderTopColor: theme.cardBorder }]}>
        <Pressable
          onPress={() => { setLogTarget(null); setSearchVisible(true); }}
          style={[styles.addBtn, { backgroundColor: ink, borderColor: ink }]}
        >
          <Text style={[styles.addBtnText, { color: theme.page }]}>+ Add exercise</Text>
        </Pressable>
      </View>

      <ExerciseSearchModal
        visible={searchVisible}
        onClose={() => { setSearchVisible(false); setLogTarget(null); }}
        onAdd={handleAdd}
        initialExercise={logTarget ?? undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  timerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 2,
  },
  timerLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  timer: { fontSize: 32, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 2, letterSpacing: -1 },
  startBtn: {
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  finishBtn: {
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  finishBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  activeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    padding: 10,
    gap: 12,
  },
  activeImage: { width: 80, height: 80 },
  activeInfo: { flex: 1, gap: 3 },
  activeName: { fontSize: 16, fontWeight: '800', lineHeight: 20 },
  activeMuscles: { fontSize: 12, textTransform: 'capitalize' },
  activeCategory: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 },
  restBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 2,
    padding: 14,
    gap: 12,
  },
  restLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  restTimer: { fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 2 },
  restOption: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  restDismiss: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  scrollContent: { padding: 14, gap: 10, paddingBottom: 100 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 2 },
  plannedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    overflow: 'hidden',
    padding: 10,
    gap: 12,
  },
  plannedImage: { width: 72, height: 72 },
  plannedInfo: { flex: 1, gap: 4 },
  plannedName: { fontSize: 15, fontWeight: '700', lineHeight: 19 },
  plannedMuscles: { fontSize: 12, textTransform: 'capitalize', color: '#888' },
  logChip: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 2,
  },
  center: { paddingTop: 40, alignItems: 'center' },
  empty: { paddingTop: 48, alignItems: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
  },
  entryName: { fontSize: 15, fontWeight: '700' },
  entryDetail: { fontSize: 13, marginTop: 2 },
  footer: { padding: 14, borderTopWidth: 1 },
  addBtn: {
    borderRadius: 26,
    borderWidth: 2,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: 'rgba(60,40,20,0.1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  addBtnText: { fontSize: 16, fontWeight: '800' },
  liveHR: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  liveHRBig: { fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] },
  peakHRLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 1 },
  celebContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  celebEmoji: { fontSize: 64 },
  celebTitle: { fontSize: 28, fontWeight: '900' },
  celebStats: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 8,
  },
  celebStat: { alignItems: 'center', gap: 2 },
  celebStatVal: { fontSize: 28, fontWeight: '900', fontVariant: ['tabular-nums'] },
  celebStatLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
});
