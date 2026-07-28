import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Image } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText, Rect } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../api/client';
import { LoadingIndicator } from '../components/LoadingIndicator';

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

const ZONES = [
  { name: 'very_light', label: 'Very light', color: '#8ED4D8' }, // teal
  { name: 'light',      label: 'Light',      color: '#B092D9' }, // purple
  { name: 'moderate',   label: 'Moderate',   color: '#F2A28C' }, // coral
  { name: 'hard',       label: 'Hard',       color: '#CE7A92' }, // berry
  { name: 'maximum',    label: 'Maximum',    color: '#A62A50' }, // deep berry
] as const;

interface HRSummary {
  avg_bpm: number | null;
  peak_bpm: number | null;
  time_in_zone_seconds: Record<string, number>;
  sample_count: number;
}

interface SessionEntry {
  id: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  weight_used: number | null;
  target_rep_range_min: number | null;
  target_rep_range_max: number | null;
  actual_reps_per_set: number[] | null;
  all_sets_maxed: boolean | null;
  exercise: { id: string; name: string; category: string; primary_muscles: string[]; images: string[] };
}

interface SessionDetail {
  id: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  entries: SessionEntry[];
  hr_summary: HRSummary | null;
  hr_samples: Array<{ recorded_at: string; bpm: number }>;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function entryLabel(entry: SessionEntry): string {
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

function ZoneBar({ summary, theme }: { summary: HRSummary; theme: any }) {
  const total = ZONES.reduce((sum, z) => sum + (summary.time_in_zone_seconds[z.name] ?? 0), 0);
  if (total === 0) return null;

  return (
    <View style={{ gap: 8 }}>
      {/* Stacked bar */}
      <View style={styles.zoneBar}>
        {ZONES.map((z) => {
          const secs = summary.time_in_zone_seconds[z.name] ?? 0;
          const flex = secs / total;
          if (flex < 0.005) return null;
          return <View key={z.name} style={{ flex, backgroundColor: z.color }} />;
        })}
      </View>

      {/* Legend */}
      <View style={styles.zoneLegend}>
        {ZONES.map((z) => {
          const secs = summary.time_in_zone_seconds[z.name] ?? 0;
          if (secs < 1) return null;
          const mins = Math.round(secs / 60);
          return (
            <View key={z.name} style={styles.zoneLegendItem}>
              <View style={[styles.zoneSwatch, { backgroundColor: z.color }]} />
              <Text style={[styles.zoneLegendText, { color: theme.textSoft }]}>
                {z.label}{mins > 0 ? ` · ${mins}m` : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HRChart({ samples, theme }: { samples: Array<{ recorded_at: string; bpm: number }>; theme: any }) {
  if (samples.length < 2) return null;

  const W = 320, H = 80;
  const PAD = { top: 8, bottom: 16, left: 28, right: 8 };
  const bpms = samples.map((s) => s.bpm);
  const minBpm = Math.min(...bpms) - 5;
  const maxBpm = Math.max(...bpms) + 5;
  const times = samples.map((s) => new Date(s.recorded_at).getTime());
  const minT = times[0], maxT = times[times.length - 1];

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const toX = (t: number) => PAD.left + ((t - minT) / (maxT - minT || 1)) * chartW;
  const toY = (bpm: number) => PAD.top + (1 - (bpm - minBpm) / (maxBpm - minBpm || 1)) * chartH;

  const points = samples.map((s, i) => `${toX(times[i])},${toY(s.bpm)}`).join(' ');
  const ink = theme.ink;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Polyline points={points} fill="none" stroke={ink} strokeWidth={2.5} />
      <SvgText x={PAD.left - 2} y={PAD.top + 4} fontSize={8} fill={theme.textSoft} textAnchor="end">
        {maxBpm}
      </SvgText>
      <SvgText x={PAD.left - 2} y={H - PAD.bottom} fontSize={8} fill={theme.textSoft} textAnchor="end">
        {Math.round(minBpm)}
      </SvgText>
    </Svg>
  );
}

export function ExerciseDetailScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const { sessionId } = route.params as { sessionId: string };
  const ink = theme.ink;

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    api.getExerciseSession(sessionId)
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]));

  if (loading) {
    return <View style={[styles.center, { backgroundColor: theme.page }]}><LoadingIndicator /></View>;
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: theme.page }]}>
        <Text style={{ color: theme.textSoft }}>Session not found.</Text>
      </View>
    );
  }

  const hasHR = session.hr_summary && session.hr_summary.sample_count > 0;
  const hasZones = hasHR && Object.values(session.hr_summary!.time_in_zone_seconds).some((v) => v > 0);

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      {/* Header stats */}
      <View style={[styles.headerCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: ink }]}>
              {new Date(session.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSoft }]}>DATE</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: ink }]}>{formatDuration(session.duration_seconds)}</Text>
            <Text style={[styles.statLabel, { color: theme.textSoft }]}>DURATION</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: ink }]}>{session.entries.length}</Text>
            <Text style={[styles.statLabel, { color: theme.textSoft }]}>EXERCISES</Text>
          </View>
        </View>

        {/* HR stats */}
        {hasHR && (
          <View style={[styles.hrRow, { borderTopColor: theme.cardBorder }]}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: theme.berry.solid }]}>
                {session.hr_summary!.avg_bpm ?? '—'}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSoft }]}>AVG BPM</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: theme.cardBorder }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: theme.coral.solid }]}>
                {session.hr_summary!.peak_bpm ?? '—'}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSoft }]}>PEAK BPM</Text>
            </View>
          </View>
        )}
      </View>

      {/* Zone bar */}
      {hasZones && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>TIME IN ZONE</Text>
          <ZoneBar summary={session.hr_summary!} theme={theme} />
        </View>
      )}

      {/* HR chart */}
      {session.hr_samples.length >= 2 && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>HEART RATE</Text>
          <HRChart samples={session.hr_samples} theme={theme} />
          {!hasZones && (
            <Text style={[styles.noZoneHint, { color: theme.textSoft }]}>
              Add your birthdate in Settings → Preferences to see heart rate zones.
            </Text>
          )}
        </View>
      )}

      {/* Exercise list */}
      <Text style={[styles.sectionLabel, { color: theme.textSoft, marginTop: 4 }]}>EXERCISES LOGGED</Text>
      {session.entries.length === 0 ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={{ color: theme.textSoft, fontSize: 13 }}>No exercises logged in this session.</Text>
        </View>
      ) : (
        session.entries.map((entry) => (
          <View key={entry.id} style={[styles.exerciseCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <CyclingImage
              images={entry.exercise.images ?? []}
              style={styles.exerciseImage}
            />
            <View style={styles.exerciseCardBody}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exerciseName, { color: theme.textStrong }]}>{entry.exercise.name}</Text>
                {entry.exercise.primary_muscles.length > 0 && (
                  <Text style={[styles.exerciseMuscles, { color: theme.textSoft }]}>
                    {entry.exercise.primary_muscles.slice(0, 3).join(', ')}
                  </Text>
                )}
                {entry.all_sets_maxed === true && entry.weight_used != null && (
                  <View style={[styles.progressionBadge, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                    <Text style={[styles.progressionText, { color: theme.teal.sub }]}>
                      All sets maxed — add weight next time
                    </Text>
                  </View>
                )}
              </View>
              <View style={[styles.exerciseDetailChip, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                <Text style={[styles.exerciseDetail, { color: theme.teal.sub }]}>{entryLabel(entry)}</Text>
              </View>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  headerCard: {
    borderRadius: 26,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  statRow: { flexDirection: 'row', padding: 16, gap: 0 },
  hrRow: { flexDirection: 'row', padding: 16, borderTopWidth: 1 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  statDivider: { width: 1, marginVertical: 2 },
  card: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    gap: 12,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  sectionLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  zoneBar: {
    height: 14,
    borderRadius: 7,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  zoneLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zoneLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoneSwatch: { width: 10, height: 10, borderRadius: 5 },
  zoneLegendText: { fontSize: 11 },
  noZoneHint: { fontSize: 11, lineHeight: 17 },
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
  exerciseImage: { width: '100%', height: 220 },
  exerciseCardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  exerciseDetailChip: {
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  progressionBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  progressionText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  exerciseName: { fontSize: 14, fontWeight: '700' },
  exerciseMuscles: { fontSize: 11, textTransform: 'capitalize', marginTop: 2 },
  exerciseDetail: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, marginVertical: 2 },
});
