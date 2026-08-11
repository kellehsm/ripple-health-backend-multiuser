import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { api } from '../../api/client';
import { Prediction } from './shared';

interface PhaseEntry { label: string; phase: string; cycles: number }
interface PhasePatterns { totalCycles: number; symptoms: PhaseEntry[]; moods: PhaseEntry[] }
interface EnergyPoint { cycle_day: number; avg_energy: number; n: number }

const PHASE_EMOJI: Record<string, string> = { menstrual: '🌙', follicular: '🌱', ovulatory: '☀️', luteal: '🍂' };

export function CycleInsights({
  theme,
  prediction,
  history,
  refresh,
}: {
  theme: any;
  prediction: Prediction | null;
  history: Array<{ start: string; end: string; length_days: number }>;
  refresh: number;
}) {
  const [patterns, setPatterns] = useState<PhasePatterns | null>(null);
  const [energy, setEnergy] = useState<EnergyPoint[]>([]);

  useEffect(() => {
    api.getCyclePhasePatterns().then((res: any) => setPatterns(res ?? null)).catch(() => setPatterns(null));
    api.getCycleEnergyCurve().then((res: any) => setEnergy(res ?? [])).catch(() => setEnergy([]));
  }, [refresh]);

  const berry = theme.berry ?? { solid: '#A62A50', tint: '#F6E3E9', fg: '#7A1F3C' };

  // ── Cycle length trend (last 6 cycles) ──
  const lengths = history.slice(-6).map((h) => h.length_days);
  const showTrend = lengths.length >= 3;
  const maxLen = showTrend ? Math.max(...lengths) : 0;
  const avgLen = prediction?.avgCycleLength ?? null;

  // ── This cycle vs average ──
  let comparison: string | null = null;
  if (prediction?.currentCycleDay != null && avgLen != null) {
    const day = prediction.currentCycleDay;
    if (day > avgLen) {
      comparison = `Day ${day} — this cycle is running longer than your ${avgLen}-day average.`;
    } else {
      const diff = avgLen - day;
      comparison = `Day ${day} of a typical ~${avgLen}-day cycle — about ${diff} ${diff === 1 ? 'day' : 'days'} to go if this one follows your average.`;
    }
  }

  // ── Energy curve ──
  const energyPts = energy.filter((e) => e.n >= 1 && e.cycle_day <= 35);
  const showEnergy = energyPts.length >= 5;

  const topSymptoms = (patterns?.symptoms ?? []).slice(0, 5);
  const topMoods = (patterns?.moods ?? []).slice(0, 3);
  const showPatterns = (patterns?.totalCycles ?? 0) >= 2 && (topSymptoms.length > 0 || topMoods.length > 0);

  if (!showTrend && !comparison && !showEnergy && !showPatterns) return null;

  return (
    <View style={{ gap: 14 }}>
      {/* Cycle length trend */}
      {showTrend && (
        <View style={[ciStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[ciStyles.title, { color: theme.textStrong }]}>Cycle Length Trend</Text>
          {comparison && (
            <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{comparison}</Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12, height: 72 }}>
            {lengths.map((len, i) => (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: '700' }}>{len}</Text>
                <View
                  style={{
                    width: '70%',
                    height: Math.max(8, (len / maxLen) * 48),
                    borderRadius: 6,
                    backgroundColor: berry.solid,
                    opacity: i === lengths.length - 1 ? 1 : 0.5,
                  }}
                />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={[ciStyles.axisLabel, { color: theme.textSoft }]}>OLDEST</Text>
            {avgLen != null && (
              <Text style={[ciStyles.axisLabel, { color: theme.textSoft }]}>AVG {avgLen}D</Text>
            )}
            <Text style={[ciStyles.axisLabel, { color: theme.textSoft }]}>LATEST</Text>
          </View>
        </View>
      )}

      {/* Phase patterns */}
      {showPatterns && (
        <View style={[ciStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[ciStyles.title, { color: theme.textStrong }]}>Patterns Across Cycles</Text>
          <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
            Based on {patterns!.totalCycles} completed {patterns!.totalCycles === 1 ? 'cycle' : 'cycles'}
          </Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {topSymptoms.map((s) => (
              <View key={`s-${s.label}-${s.phase}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14 }}>{PHASE_EMOJI[s.phase] ?? '•'}</Text>
                <Text style={{ color: theme.textStrong, fontSize: 13, flex: 1 }} allowFontScaling maxFontSizeMultiplier={1.3}>
                  <Text style={{ fontWeight: '700', textTransform: 'capitalize' }}>{s.label}</Text>
                  {' '}showed up in the {s.phase} phase in {s.cycles} of {patterns!.totalCycles} cycles
                </Text>
              </View>
            ))}
            {topMoods.map((m) => (
              <View key={`m-${m.label}-${m.phase}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 14 }}>{PHASE_EMOJI[m.phase] ?? '•'}</Text>
                <Text style={{ color: theme.textStrong, fontSize: 13, flex: 1 }} allowFontScaling maxFontSizeMultiplier={1.3}>
                  Feeling <Text style={{ fontWeight: '700' }}>{m.label.toLowerCase()}</Text> came up in the {m.phase} phase in {m.cycles} of {patterns!.totalCycles} cycles
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Energy curve */}
      {showEnergy && (
        <View style={[ciStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[ciStyles.title, { color: theme.textStrong }]}>Energy Through Your Cycle</Text>
          <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
            Average logged energy by cycle day
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginTop: 12, height: 56 }}>
            {energyPts.map((p) => (
              <View
                key={p.cycle_day}
                style={{
                  flex: 1,
                  height: Math.max(4, (p.avg_energy / 10) * 52),
                  borderRadius: 3,
                  backgroundColor: theme.teal.solid,
                  opacity: 0.35 + (p.avg_energy / 10) * 0.65,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
            <Text style={[ciStyles.axisLabel, { color: theme.textSoft }]}>DAY {energyPts[0].cycle_day}</Text>
            <Text style={[ciStyles.axisLabel, { color: theme.textSoft }]}>DAY {energyPts[energyPts.length - 1].cycle_day}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const ciStyles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    shadowColor: 'rgba(60,40,20,0.1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  title: { fontSize: 14, fontWeight: '800' },
  axisLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
});
