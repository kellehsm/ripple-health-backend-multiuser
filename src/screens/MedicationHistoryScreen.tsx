import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { ThemedIcon, resolveIcon } from '../theme/iconRegistry';
import { api } from '../api/client';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { SectionLabel } from '../components/SectionLabel';
import { formatDateWithTime, addDays, todayStr } from '../utils/dateUtils';

interface DoseStats {
  is_prn: boolean;
  adherence30: number | null;
  streak: number;
  totalDoses: number;
  usualHour: number | null;
  takenDays: Array<{ day: string; count: number }>;
}

function hourLabel(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

interface HistoryEntry {
  id: string;
  change_type: 'added' | 'dose_changed' | 'frequency_changed' | 'prescriber_changed' | 'stopped';
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

/** Maps change_type to a medHistory.* icon slot. */
function changeTypeSlot(type: string): string {
  const map: Record<string, string> = {
    added:              'medHistory.added',
    dose_changed:       'medHistory.dose_changed',
    frequency_changed:  'medHistory.frequency_changed',
    prescriber_changed: 'medHistory.prescriber_changed',
    stopped:            'medHistory.stopped',
  };
  return map[type] ?? 'medHistory.dose_changed';
}

const CHANGE_LABEL: Record<string, string> = {
  added: 'Added',
  dose_changed: 'Dose changed',
  frequency_changed: 'Schedule changed',
  prescriber_changed: 'Prescriber changed',
  stopped: 'Stopped',
};

export function MedicationHistoryScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const { medicationId, medicationName } = route.params as { medicationId: string; medicationName: string };
  const ink = theme.ink;

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [stats, setStats] = useState<DoseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchRef = useRef(0);

  const fetchData = useCallback((force = false) => {
    let cancelled = false;
    if (!force && Date.now() - lastFetchRef.current < 30_000) return () => { cancelled = true; };
    lastFetchRef.current = Date.now();
    api.getMedicationHistory(medicationId)
      .then((rows) => { if (!cancelled) setHistory(rows ?? []); })
      .catch(() => { if (!cancelled) setHistory([]); })
      .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false); } });
    api.getMedicationDoseStats(medicationId)
      .then((res: any) => { if (!cancelled) setStats(res ?? null); })
      .catch(() => { if (!cancelled) setStats(null); });
    return () => { cancelled = true; };
  }, [medicationId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    return fetchData();
  }, [fetchData]));

  function handleRefresh() {
    setRefreshing(true);
    fetchData(true);
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.page }]}>
        <LoadingIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.solid} colors={[theme.teal.solid]} />}
    >
      <Text style={[styles.medName, { color: theme.textStrong }]}>{medicationName}</Text>

      {stats && (stats.totalDoses > 0 || !stats.is_prn) && (
        <View style={[styles.statsCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <View style={styles.statsRow}>
            {stats.is_prn ? (
              <View style={styles.statTile}>
                <ThemedIcon slot="ui.hand" size={22} style={{ marginBottom: 2 } as any} />
                <Text style={[styles.statLabel, { color: theme.textSoft }]}>As needed</Text>
              </View>
            ) : (
              <View style={styles.statTile}>
                <Text style={[styles.statValue, { color: theme.teal.fg }]}>
                  {stats.adherence30 != null ? `${stats.adherence30}%` : '—'}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSoft }]}>30-day</Text>
              </View>
            )}
            {!stats.is_prn && (
              <View style={styles.statTile}>
                <Text style={[styles.statValue, { color: theme.textStrong }]}>
                  {stats.streak > 0 ? `🔥 ${stats.streak}` : '—'}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textSoft }]}>Streak</Text>
              </View>
            )}
            <View style={styles.statTile}>
              <Text style={[styles.statValue, { color: theme.textStrong }]}>{stats.totalDoses}</Text>
              <Text style={[styles.statLabel, { color: theme.textSoft }]}>Doses · 90d</Text>
            </View>
            <View style={styles.statTile}>
              <Text style={[styles.statValue, { color: theme.textStrong }]}>
                {stats.usualHour != null ? hourLabel(stats.usualHour) : '—'}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSoft }]}>Usual time</Text>
            </View>
          </View>

          {stats.totalDoses > 0 && (() => {
            const countByDay: Record<string, number> = {};
            for (const d of stats.takenDays) countByDay[d.day] = d.count;
            const today = todayStr();
            const days: string[] = [];
            for (let i = 83; i >= 0; i--) days.push(addDays(today, -i));
            const weeks: string[][] = [];
            for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
            return (
              <View style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', gap: 3, justifyContent: 'space-between' }}>
                  {weeks.map((week, wi) => (
                    <View key={wi} style={{ gap: 3, flex: 1 }}>
                      {week.map((day) => {
                        const taken = (countByDay[day] ?? 0) > 0;
                        return (
                          <View
                            key={day}
                            style={{
                              aspectRatio: 1,
                              borderRadius: 3,
                              backgroundColor: taken ? theme.teal.solid : theme.cardBorder,
                              opacity: taken ? 1 : 0.35,
                            }}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
                <SectionLabel text="Doses · last 12 weeks" style={{ marginTop: 5 }} />
              </View>
            );
          })()}
        </View>
      )}

      <SectionLabel text="Change history" />

      {history.length === 0 ? (
        <View style={styles.empty}>
          <ThemedIcon slot="medHistory.list" size={32} />
          <Text style={[styles.emptyText, { color: theme.textSoft }]}>No changes recorded yet.</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {history.map((entry, i) => (
            <View key={entry.id} style={styles.entryRow}>
              {/* Connector line */}
              <View style={styles.connector}>
                <ThemedIcon slot={changeTypeSlot(entry.change_type)} size={18} style={styles.icon as any} />
                {i < history.length - 1 && (
                  <View style={[styles.line, { backgroundColor: theme.cardBorder }]} />
                )}
              </View>

              <View style={[styles.entryCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                <View style={styles.entryHeader}>
                  <Text style={[styles.changeType, { color: theme.textStrong }]}>
                    {CHANGE_LABEL[entry.change_type] ?? entry.change_type}
                  </Text>
                  <Text style={[styles.date, { color: theme.textSoft }]}>{formatDateWithTime(entry.changed_at)}</Text>
                </View>

                {(entry.old_value || entry.new_value) && (
                  <View style={styles.valueRow}>
                    {entry.old_value && (
                      <Text style={[styles.oldValue, { color: theme.textSoft }]}>
                        {entry.old_value}
                      </Text>
                    )}
                    {entry.old_value && entry.new_value && (
                      <Text style={{ color: theme.textSoft, fontSize: 12 }}> → </Text>
                    )}
                    {entry.new_value && (
                      <Text style={[styles.newValue, { color: theme.textStrong }]}>
                        {entry.new_value}
                      </Text>
                    )}
                  </View>
                )}

                {entry.reason && (
                  <Text style={[styles.reason, { color: theme.textSoft }]}>Reason: {entry.reason}</Text>
                )}
                {entry.changed_by && (
                  <Text style={[styles.reason, { color: theme.textSoft }]}>By: {entry.changed_by}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  medName: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  statsCard: { borderRadius: 22, borderWidth: 2, padding: 14 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statTile: { alignItems: 'center', flex: 1, gap: 2 },
  statValue: { fontSize: 17, fontWeight: '900' },
  statLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  empty: { paddingTop: 48, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 14 },
  timeline: { gap: 0 },
  entryRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  connector: { alignItems: 'center', width: 28 },
  icon: { fontSize: 18, lineHeight: 24 },
  line: { width: 2, flex: 1, minHeight: 16, marginTop: 4, marginBottom: 4 },
  entryCard: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  changeType: { fontSize: 13, fontWeight: '700', flex: 1 },
  date: { fontSize: 11, textAlign: 'right', flexShrink: 1 },
  valueRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  oldValue: { fontSize: 12, textDecorationLine: 'line-through' },
  newValue: { fontSize: 12, fontWeight: '600' },
  reason: { fontSize: 11, fontStyle: 'italic' },
});
