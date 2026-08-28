import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { api } from '../../api/client';
import { formatDateLocal } from '../../utils/dateUtils';
import { CycleLog } from './shared';

interface PhaseEntry { label: string; phase: string; cycles: number }

function humanizeLabel(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function moodColor(label: string, theme: any): string | null {
  const l = label.toLowerCase();
  if (/great|amazing|happy|excited|energetic/.test(l)) return theme.green?.solid ?? '#3E8E5A';
  if (/good|calm|content|relaxed/.test(l)) return theme.teal.solid;
  if (/okay|fine|meh|neutral/.test(l)) return theme.amber?.solid ?? '#D97706';
  if (/low|sad|tired|drained|down/.test(l)) return theme.coral?.solid ?? '#E8654E';
  if (/rough|awful|angry|anxious|stressed|irritable/.test(l)) return theme.red?.solid ?? '#C0392B';
  return theme.purple?.solid ?? '#7B3FBF';
}

const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function SymptomsView({ theme }: { theme: any }) {
  const [symptomCounts, setSymptomCounts] = useState<{ label: string; count: number }[]>([]);
  const [phaseBySymptom, setPhaseBySymptom] = useState<Record<string, PhaseEntry>>({});
  const [totalCycles, setTotalCycles] = useState(0);
  const [yearLogs, setYearLogs] = useState<CycleLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const end = formatDateLocal(new Date());
    const start90 = formatDateLocal(new Date(Date.now() - 90 * 86400000));
    const yearStart = `${end.slice(0, 4)}-01-01`;

    Promise.all([
      api.getCycleLogs(start90, end).catch(() => [] as any[]),
      api.getCycleLogs(yearStart, end).catch(() => [] as any[]),
      api.getCyclePhasePatterns().catch(() => null),
    ]).then(([logs, yearRows, patterns]: any[]) => {
      const counts: Record<string, number> = {};
      for (const log of (logs ?? [])) {
        for (const s of (log.symptoms ?? [])) {
          counts[s] = (counts[s] ?? 0) + 1;
        }
      }
      setSymptomCounts(
        Object.entries(counts)
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
      );
      setYearLogs(yearRows ?? []);

      // For each symptom keep the phase it appeared in across the most cycles
      const byLabel: Record<string, PhaseEntry> = {};
      for (const e of (patterns?.symptoms ?? []) as PhaseEntry[]) {
        if (!byLabel[e.label] || e.cycles > byLabel[e.label].cycles) byLabel[e.label] = e;
      }
      setPhaseBySymptom(byLabel);
      setTotalCycles(patterns?.totalCycles ?? 0);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <ActivityIndicator color={theme.teal.solid} />
      </View>
    );
  }

  // ── Year in pixels ──
  const year = new Date().getFullYear();
  const logByDate: Record<string, CycleLog> = {};
  for (const l of yearLogs) logByDate[l.log_date] = l;
  const today = formatDateLocal(new Date());
  const anyYearData = yearLogs.length > 0;

  function pixelColor(log: CycleLog | undefined): { bg: string; opacity: number } {
    if (!log) return { bg: theme.cardBorder, opacity: 0.25 };
    if (log.flow_intensity && log.flow_intensity !== 'none') {
      return { bg: theme.cycle?.period ?? '#D96C57', opacity: 1 };
    }
    if (log.mood_label) {
      const first = String(log.mood_label).split(',')[0].trim();
      return { bg: moodColor(first, theme) ?? theme.purple?.solid ?? '#7B3FBF', opacity: 0.85 };
    }
    if ((log.symptoms ?? []).length > 0) {
      return { bg: theme.cycle?.symptom ?? theme.teal.solid, opacity: 0.7 };
    }
    return { bg: theme.cardBorder, opacity: 0.5 };
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 100 }} scrollEnabled={false}>
      {symptomCounts.length === 0 && !anyYearData ? (
        <View style={[svStyles.card, { padding: 20, alignItems: 'center', backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={{ fontSize: 28, marginBottom: 8 }}>📝</Text>
          <Text style={{ color: theme.textSoft, fontSize: 14, textAlign: 'center' }}>
            No symptoms logged yet. Log cycle days to track symptoms over time.
          </Text>
        </View>
      ) : (
        <>
          {symptomCounts.length > 0 && (
            <>
              <Text style={[svStyles.sectionLabel, { color: theme.textSoft }]}>Last 90 days</Text>
              <View style={[svStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, overflow: 'hidden' }]}>
                {symptomCounts.map(({ label, count }, i) => {
                  const phase = phaseBySymptom[label];
                  return (
                    <View key={label} style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.cardBorder }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: '500' }}>{humanizeLabel(label)}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ height: 6, width: Math.max(20, Math.min(80, count * 8)), borderRadius: 3, backgroundColor: theme.berry?.solid ?? '#A62A50', opacity: 0.6 }} />
                          <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: '700', minWidth: 28, textAlign: 'right' }}>{count}×</Text>
                        </View>
                      </View>
                      {phase && totalCycles >= 2 && (
                        <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
                          Mostly in the {phase.phase} phase — {phase.cycles} of {totalCycles} cycles
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Year in pixels */}
          {anyYearData && (
            <>
              <Text style={[svStyles.sectionLabel, { color: theme.textSoft }]}>{year} in pixels</Text>
              <View style={[svStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, padding: 12 }]}>
                <View style={{ gap: 3 }}>
                  {MONTH_LABELS.map((m, mi) => {
                    const daysInMonth = new Date(year, mi + 1, 0).getDate();
                    return (
                      <View key={mi} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: theme.textSoft, fontSize: 8, fontWeight: '800', width: 10, textAlign: 'center' }}>{m}</Text>
                        <View style={{ flexDirection: 'row', gap: 2, flex: 1 }}>
                          {Array.from({ length: 31 }, (_, di) => {
                            const dateStr = `${year}-${String(mi + 1).padStart(2, '0')}-${String(di + 1).padStart(2, '0')}`;
                            if (di + 1 > daysInMonth) return <View key={di} style={{ flex: 1 }} />;
                            if (dateStr > today) {
                              return <View key={di} style={{ flex: 1, aspectRatio: 1, borderRadius: 2, backgroundColor: theme.cardBorder, opacity: 0.12 }} />;
                            }
                            const { bg, opacity } = pixelColor(logByDate[dateStr]);
                            return <View key={di} style={{ flex: 1, aspectRatio: 1, borderRadius: 2, backgroundColor: bg, opacity }} />;
                          })}
                        </View>
                      </View>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.07)' }}>
                  <View style={svStyles.legendItem}>
                    <View style={[svStyles.legendDot, { backgroundColor: theme.cycle?.period ?? '#D96C57' }]} />
                    <Text style={[svStyles.legendText, { color: theme.textSoft }]}>Period</Text>
                  </View>
                  <View style={svStyles.legendItem}>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      {[theme.green?.solid ?? '#3E8E5A', theme.teal.solid, theme.amber?.solid ?? '#D97706', theme.coral?.solid ?? '#E8654E'].map((c, i) => (
                        <View key={i} style={[svStyles.legendDot, { backgroundColor: c }]} />
                      ))}
                    </View>
                    <Text style={[svStyles.legendText, { color: theme.textSoft }]}>Mood (great → low)</Text>
                  </View>
                  <View style={svStyles.legendItem}>
                    <View style={[svStyles.legendDot, { backgroundColor: theme.cycle?.symptom ?? theme.teal.solid, opacity: 0.7 }]} />
                    <Text style={[svStyles.legendText, { color: theme.textSoft }]}>Symptoms only</Text>
                  </View>
                </View>
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const svStyles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 2,
    shadowColor: 'rgba(60,40,20,0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 10 },
});
