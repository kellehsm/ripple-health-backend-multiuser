import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Alert, Image, Animated, Dimensions,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import Svg, { Polyline, Defs, LinearGradient as SvgLinearGradient, Stop, Polygon } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { ThemedIcon } from '../theme/iconRegistry';
import { api } from '../api/client';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ShadowCard } from '../components/ShadowCard';
import { Swipeable } from 'react-native-gesture-handler';
import { ExerciseSearchModal } from '../components/ExerciseSearchModal';
import { PlanExercise } from '../components/WorkoutPlannerModal';
import { fireRestTimerDone } from '../lib/smartNotifications';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

// Exercise images cycle through 2-4 poses to imitate a GIF. Two things matter
// for the "feels like a GIF" feel: (1) the interval — GIF-native pacing is
// 400ms per frame, not 2s — and (2) prefetching every URI before the first
// swap so the browser cache is warm and the flip is instant. We also render
// all frames stacked and toggle opacity instead of swapping the Image `source`
// prop, which avoids RN's built-in cross-fade + re-decode on every change.
function CyclingImage({ images, style }: { images: string[]; style: any }) {
  const { theme } = useTheme();
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (images.length === 0) return;
    let cancelled = false;
    Promise.all(images.map(uri => Image.prefetch(IMAGE_BASE + uri).catch(() => null)))
      .then(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [images.join("|")]);
  useEffect(() => {
    if (!ready || images.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), 400);
    return () => clearInterval(t);
  }, [ready, images.length]);
  if (!images.length) return <View style={[style, { backgroundColor: theme.teal.bg, opacity: 0.4, borderRadius: 14 }]} />;
  return (
    <View style={[style, { borderRadius: 14, overflow: "hidden" }]}>
      {images.map((uri, i) => (
        <Image
          key={uri}
          source={{ uri: IMAGE_BASE + uri }}
          style={[StyleSheet.absoluteFill, { opacity: i === idx ? 1 : 0 }]}
          resizeMode="cover"
          fadeDuration={0}
        />
      ))}
    </View>
  );
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

const HRSparkline = React.memo(function HRSparkline({ readings, color }: { readings: Array<{ bpm: number }>; color: string }) {
  const W = SCREEN_W - 140;
  const H = 28;
  const { pts, firstX, lastX, currentBpm } = useMemo(() => {
    const bpms = readings.map(r => r.bpm);
    const min = Math.min(...bpms);
    const max = Math.max(...bpms);
    const range = max - min || 1;
    const ptsStr = bpms.map((b, i) => {
      const x = (i / (bpms.length - 1)) * W;
      const y = H - ((b - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const ptArr = ptsStr.split(' ');
    return {
      pts: ptsStr,
      firstX: ptArr[0]?.split(',')[0],
      lastX: ptArr[ptArr.length - 1]?.split(',')[0],
      currentBpm: bpms[bpms.length - 1] ?? 0,
    };
  }, [readings, W, H]);
  return (
    <Svg
      width={W}
      height={H}
      style={{ marginTop: 6 }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Live heart rate chart, current ${currentBpm} bpm`}
    >
      {readings.length >= 2 && (
        <>
          <Defs>
            <SvgLinearGradient id="exSessionFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.25" />
              <Stop offset="1" stopColor={color} stopOpacity="0.02" />
            </SvgLinearGradient>
          </Defs>
          <Polygon points={`${pts} ${lastX},${H} ${firstX},${H}`} fill="url(#exSessionFill)" />
        </>
      )}
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
});

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
  const [hrPollAttempts, setHrPollAttempts] = useState(0);
  const [greatSetToast, setGreatSetToast] = useState<string | null>(null);

  // Auto-dismiss the "Great set!" nudge after 2.5s so it doesn't linger through the next rep.
  useEffect(() => {
    if (!greatSetToast) return;
    const t = setTimeout(() => setGreatSetToast(null), 2500);
    return () => clearTimeout(t);
  }, [greatSetToast]);
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
      Alert.alert(
        'Failed to load',
        'Could not load the session — check your connection and try again.',
        [
          { text: 'Back', style: 'cancel', onPress: () => navigation.goBack() },
          { text: 'Retry', onPress: () => { loadSession(); } },
        ],
      );
    } finally {
      setLoadingEntries(false);
    }
  }, [sessionId]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    api.getExerciseSession(sessionId)
      .then((s) => { if (!cancelled) setEntries(s.entries ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingEntries(false); });
    return () => { cancelled = true; };
  }, [sessionId]));

  useEffect(() => () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (restTimerRef.current) { clearInterval(restTimerRef.current); restTimerRef.current = null; }
    if (hrPollRef.current) { clearInterval(hrPollRef.current); hrPollRef.current = null; }
  }, []);

  async function pollHR() {
    if (!startEpochRef.current) return;
    setHrPollAttempts((n) => n + 1);
    try {
      const start = new Date(startEpochRef.current).toISOString();
      const end = new Date().toISOString();
      const readings = await api.heartRateRange(start, end);
      if (Array.isArray(readings) && readings.length > 0) {
        setSessionHR(readings);
      }
    } catch {}
  }
  // After ~30 poll attempts (~30s) with no HR data, assume the source isn't
  // wired up and show a hint instead of an empty timer-bar slot forever.
  const hrHintVisible = started && sessionHR.length === 0 && hrPollAttempts > 30;

  // Pause offset — number of ms the session has been paused for. Used so `elapsed`
  // stays continuous across pauses (start_epoch stays fixed, we subtract).
  const pauseOffsetRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  function startTicker() {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      if (!startEpochRef.current) return;
      const secs = Math.floor((Date.now() - startEpochRef.current - pauseOffsetRef.current) / 1000);
      setElapsed(formatSecs(secs));
    }, 1000);
  }

  function handleStartWorkout() {
    if (started || timerRef.current) return;
    setStarted(true);
    startEpochRef.current = Date.now();
    pauseOffsetRef.current = 0;
    startTicker();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    pollHR();
    hrPollRef.current = setInterval(pollHR, 15000);
  }

  function togglePause() {
    if (!started) return;
    Haptics.selectionAsync().catch(() => {});
    if (isPaused) {
      // Resume: add the pause duration to the offset, restart the ticker.
      if (pauseStartRef.current !== null) {
        pauseOffsetRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = null;
      }
      startTicker();
      if (!hrPollRef.current) hrPollRef.current = setInterval(pollHR, 15000);
      setIsPaused(false);
    } else {
      // Pause: stop ticker + HR poll, remember when we paused.
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (hrPollRef.current) { clearInterval(hrPollRef.current); hrPollRef.current = null; }
      pauseStartRef.current = Date.now();
      setIsPaused(true);
    }
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
      // "Great set!" nudge when every logged rep hits or exceeds the target max.
      if (
        form.target_rep_range_max &&
        form.actual_reps_per_set?.length &&
        form.actual_reps_per_set.every((r) => r >= form.target_rep_range_max!)
      ) {
        setGreatSetToast(`Great set! Every rep hit ${form.target_rep_range_max}+`);
      }
      // Animate the removal of the planned card so the list feels responsive.
      if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
      }
      LayoutAnimation.configureNext(LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ));
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Alert.alert(
        'Failed to save',
        'Could not log the exercise — check your connection and try again.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => { handleAdd(exercise, form).catch(() => {}); } },
        ],
      );
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
            Alert.alert(
              'Failed to remove',
              'Could not remove the entry — check your connection and try again.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Retry', onPress: () => { handleDeleteEntry(entryId); } },
              ],
            );
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
            // Retro-logged (detected-workout) sessions already have ended_at —
            // the PATCH 404s in that case, which is fine.
            await api.finishExerciseSession(sessionId).catch(() => {});
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
            Alert.alert(
              'Failed to finish',
              'Could not save the session — check your connection and try again.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => setFinishing(false) },
                { text: 'Retry', onPress: () => { setFinishing(false); handleFinish(); } },
              ],
            );
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
        <ThemedIcon slot="ui.gym" size={64} style={styles.celebEmoji as any} />
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
      {greatSetToast ? (
        <View
          style={{
            position: 'absolute',
            top: 16,
            left: 20,
            right: 20,
            zIndex: 40,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: theme.teal.solid,
            backgroundColor: theme.teal.tint,
            alignItems: 'center',
          }}
          accessibilityLiveRegion="polite"
          accessibilityLabel={greatSetToast}
        >
          <Text style={{ color: theme.teal.sub, fontSize: 14, fontWeight: '900', letterSpacing: 0.3 }} allowFontScaling maxFontSizeMultiplier={1.3}>
            💪  {greatSetToast}
          </Text>
        </View>
      ) : null}
      {/* Timer bar */}
      <View style={[styles.timerBar, { backgroundColor: theme.card, borderBottomColor: ink }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16 }}>
            <View>
              <Text style={[styles.timerLabel, { color: theme.textSoft }]} allowFontScaling maxFontSizeMultiplier={1.3}>SESSION TIME</Text>
              <Text style={[styles.timer, { color: ink }]} allowFontScaling maxFontSizeMultiplier={1.2} accessibilityLabel={`Session time ${elapsed}`}>{elapsed}</Text>
            </View>
            {liveHR ? (
              <View
                style={{ paddingBottom: 4 }}
                accessibilityLabel={`Heart rate ${liveHR} beats per minute${peakHR ? `, peak ${peakHR}` : ""}`}
              >
                <Text style={[styles.timerLabel, { color: theme.textSoft }]}>HEART RATE</Text>
                <Text style={[styles.liveHRBig, { color: theme.coral.solid }]} allowFontScaling maxFontSizeMultiplier={1.3}>
                  ♥ {liveHR} <Text style={{ fontSize: 14 }}>bpm</Text>
                </Text>
                {peakHR && (
                  <Text style={[styles.peakHRLabel, { color: theme.textSoft }]}>peak {peakHR}</Text>
                )}
              </View>
            ) : hrHintVisible ? (
              <View style={{ paddingBottom: 4, maxWidth: 180 }} accessibilityLabel="No live heart rate available. Enable Health Connect to see live BPM.">
                <Text style={[styles.timerLabel, { color: theme.textSoft }]}>HEART RATE</Text>
                <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '700' }}>
                  Not syncing — enable Health Connect for live BPM
                </Text>
              </View>
            ) : null}
          </View>
          {sessionHR.length >= 3 && (
            <HRSparkline readings={sessionHR} color={theme.coral.solid} />
          )}
        </View>
        {!started ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              handleStartWorkout();
            }}
            style={[styles.startBtn, { backgroundColor: theme.teal.solid, borderColor: ink }]}
            accessibilityRole="button"
            accessibilityLabel="Start workout"
          >
            <Text style={styles.startBtnText} allowFontScaling maxFontSizeMultiplier={1.2}>▶  Start</Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable
              onPress={togglePause}
              style={[styles.pauseBtn, { borderColor: ink, backgroundColor: isPaused ? theme.teal.solid : theme.card }]}
              accessibilityRole="button"
              accessibilityLabel={isPaused ? "Resume workout timer" : "Pause workout timer"}
              accessibilityState={{ selected: isPaused }}
              hitSlop={4}
            >
              <Text style={{ color: isPaused ? '#fff' : ink, fontSize: 16, fontWeight: '900' }} allowFontScaling maxFontSizeMultiplier={1.2}>
                {isPaused ? '▶' : '⏸'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleFinish}
              disabled={finishing}
              style={[styles.finishBtn, { backgroundColor: theme.coral.solid, borderColor: ink }]}
              accessibilityRole="button"
              accessibilityLabel="Finish workout"
              accessibilityState={{ busy: finishing }}
            >
              {finishing
                ? <LoadingIndicator color="#fff" size="small" />
                : <Text style={styles.finishBtnText} allowFontScaling maxFontSizeMultiplier={1.2}>Finish</Text>
              }
            </Pressable>
          </View>
        )}
      </View>

      {/* Active exercise card — kept visible during rest so the user can see
          what they just finished while the timer counts down. */}
      {activeExercise && (
        <View style={[styles.activeCard, { backgroundColor: theme.card, borderColor: theme.teal.solid ?? ink }]}
          accessibilityLabel={`Just logged: ${activeExercise.name}`}
        >
          <CyclingImage images={activeExercise.images} style={styles.activeImage} />
          <View style={styles.activeInfo}>
            <Text style={[styles.activeName, { color: theme.textStrong }]} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.3}>
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
            <Text style={[styles.restTimer, { color: theme.teal.sub }]} allowFontScaling maxFontSizeMultiplier={1.2} accessibilityLabel={`Rest ${restSeconds} seconds remaining`}>{formatSecs(restSeconds)}</Text>
          </View>
          <View style={{ gap: 6, maxWidth: 160 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {REST_OPTIONS.map(opt => (
                <Pressable
                  key={opt}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); startRestTimer(opt); }}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                    Alert.prompt?.(
                      'Custom rest',
                      'Rest duration in seconds',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Start',
                          onPress: (text?: string) => {
                            const n = parseInt(String(text ?? ''), 10);
                            if (!isNaN(n) && n > 0 && n <= 900) startRestTimer(n);
                          },
                        },
                      ],
                      'plain-text',
                      String(opt),
                      'numeric',
                    );
                  }}
                  style={[styles.restOption, {
                    backgroundColor: theme.teal.solid,
                    borderColor: theme.teal.solid,
                    flexBasis: '48%',
                  }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Rest ${opt} seconds`}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }} allowFontScaling maxFontSizeMultiplier={1.2}>{opt}s</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              onPress={dismissRest}
              style={[styles.restDismiss, { borderColor: theme.teal.solid, minHeight: 40 }]}
              accessibilityRole="button"
              accessibilityLabel="Done resting, skip the timer"
            >
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
                  <Text style={[styles.plannedName, { color: theme.textStrong }]} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.3}>
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
          <View style={{ gap: 8 }}>
            <ShadowCard skeleton skeletonHeight={68} />
            <ShadowCard skeleton skeletonHeight={68} />
          </View>
        ) : entries.length > 0 ? (
          <>
            {planned.length > 0 && (
              <Text style={[styles.sectionLabel, { color: theme.textSoft, marginTop: 4 }]}>LOGGED</Text>
            )}
            <Text style={{ color: theme.textSoft, fontSize: 11, marginBottom: 2, textAlign: "right" }}>Hold a set to delete</Text>
            {entries.map((entry) => (
              <Swipeable
                key={entry.id}
                overshootRight={false}
                friction={2}
                renderRightActions={() => (
                  <View style={{ justifyContent: 'center', paddingHorizontal: 18, backgroundColor: theme.coral.solid, borderRadius: 14, marginVertical: 4 }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>Remove</Text>
                  </View>
                )}
                onSwipeableOpen={() => handleDeleteEntry(entry.id)}
              >
                <Pressable
                  onLongPress={() => handleDeleteEntry(entry.id)}
                  style={[styles.entryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.exercise.name}, ${entryLabel(entry)}`}
                  accessibilityHint="Swipe left or long-press to remove"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.entryName, { color: theme.textStrong }]} allowFontScaling maxFontSizeMultiplier={1.3}>{entry.exercise.name}</Text>
                    <Text style={[styles.entryDetail, { color: theme.teal.fg }]} allowFontScaling maxFontSizeMultiplier={1.3}>{entryLabel(entry)}</Text>
                  </View>
                  <Text style={{ color: theme.textSoft, fontSize: 11 }}>swipe to remove</Text>
                </Pressable>
              </Swipeable>
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
    borderRadius: 18,
    borderWidth: 2,
    paddingHorizontal: 26,
    paddingVertical: 14,
    minHeight: 52,
    minWidth: 96,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  finishBtn: {
    borderRadius: 18,
    borderWidth: 2,
    paddingHorizontal: 22,
    paddingVertical: 14,
    minHeight: 52,
    minWidth: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  finishBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  pauseBtn: {
    borderRadius: 18,
    borderWidth: 2,
    minHeight: 52,
    minWidth: 52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
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
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 40,
    minWidth: 60,
    justifyContent: 'center',
    alignItems: 'center',
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
  plannedMuscles: { fontSize: 12, textTransform: 'capitalize' },
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
