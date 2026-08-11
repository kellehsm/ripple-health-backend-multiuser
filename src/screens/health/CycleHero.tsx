import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { coloredShadow } from '../../theme/styleUtils';
import { fmtDate, todayStr } from '../../utils/dateUtils';
import { Prediction, getPhaseLabel, PHASE_GUIDE } from './shared';
import { ProgressRing } from './AdherenceHero';

export function CycleHero({ theme, prediction }: { theme: any; prediction: Prediction | null }) {
  if (!prediction?.lastPeriodStart || prediction.currentCycleDay == null) return null;

  const berry = theme.berry ?? { solid: '#A62A50', tint: '#F6E3E9', fg: '#7A1F3C' };
  const today = todayStr();
  const cycleDay = prediction.currentCycleDay;
  const avgLen = prediction.avgCycleLength ?? 28;
  const phase = getPhaseLabel(cycleDay);
  const phaseIcon = PHASE_GUIDE[phase]?.icon ?? '';
  const progress = Math.min(1, cycleDay / avgLen);

  // Countdown to predicted period — descriptive when overdue, never negative
  let countdown: string | null = null;
  if (prediction.predictedNextStart) {
    const diff = Math.round(
      (new Date(prediction.predictedNextStart + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000
    );
    if (diff > 1) countdown = `Period expected in ${diff} days`;
    else if (diff === 1) countdown = 'Period expected tomorrow';
    else if (diff === 0) countdown = 'Period expected today';
    else countdown = 'Period expected — running a few days late';
  }

  // Fertile window — only mention when it's upcoming or current
  let fertileNote: string | null = null;
  if (prediction.fertileWindowStart && prediction.fertileWindowEnd && prediction.fertileWindowEnd >= today) {
    fertileNote = today >= prediction.fertileWindowStart
      ? `Fertile window now through ${fmtDate(prediction.fertileWindowEnd)}`
      : `Fertile window ${fmtDate(prediction.fertileWindowStart)} – ${fmtDate(prediction.fertileWindowEnd)}`;
  }

  return (
    <View style={[chStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, ...coloredShadow(berry.solid) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ProgressRing size={92} stroke={9} progress={progress} color={berry.solid} track={berry.tint ?? theme.cycle.mood}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: '900' }} allowFontScaling maxFontSizeMultiplier={1.2}>
              {cycleDay}
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>CYCLE DAY</Text>
          </View>
        </ProgressRing>

        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: berry.fg, fontSize: 17, fontWeight: '900' }} allowFontScaling maxFontSizeMultiplier={1.2}>
            {phaseIcon} {phase} phase
          </Text>
          {countdown && (
            <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: '700' }} allowFontScaling maxFontSizeMultiplier={1.3}>
              {countdown}
            </Text>
          )}
          {fertileNote && (
            <Text style={{ color: theme.textSoft, fontSize: 12 }} allowFontScaling maxFontSizeMultiplier={1.3}>
              ✨ {fertileNote}
            </Text>
          )}
          {prediction.cycleLengthsUsed > 0 && (
            <Text style={{ color: theme.textSoft, fontSize: 10 }}>
              Estimate based on {prediction.cycleLengthsUsed} logged {prediction.cycleLengthsUsed === 1 ? 'cycle' : 'cycles'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function PhaseGuideCard({ theme, currentPhase }: { theme: any; currentPhase: string }) {
  const [selected, setSelected] = React.useState(currentPhase);
  const guide = PHASE_GUIDE[selected];
  if (!guide) return null;
  const berry = theme.berry ?? { solid: '#A62A50', tint: '#F6E3E9', fg: '#7A1F3C' };

  return (
    <View style={[chStyles.guideCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Text style={[chStyles.guideTitle, { color: theme.textStrong }]}>Phase Guide</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {Object.keys(PHASE_GUIDE).map((p) => {
          const active = p === selected;
          return (
            <Text
              key={p}
              onPress={() => setSelected(p)}
              style={[
                chStyles.phaseChip,
                {
                  backgroundColor: active ? berry.solid : (berry.tint ?? theme.cycle.mood),
                  color: active ? '#fff' : berry.fg,
                  borderColor: active ? theme.ink : 'transparent',
                },
              ]}
            >
              {PHASE_GUIDE[p].icon} {p}{p === currentPhase ? ' •' : ''}
            </Text>
          );
        })}
      </View>
      <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 10, textTransform: 'uppercase' }}>
        {guide.days}{selected === currentPhase ? ' · You are here' : ''}
      </Text>
      <Text style={{ color: theme.textSoft, fontSize: 13, lineHeight: 19, marginTop: 4 }}>{guide.body}</Text>
      <Text style={{ color: theme.textSoft, fontSize: 10, marginTop: 8, fontStyle: 'italic' }}>
        General information — every cycle is different.
      </Text>
    </View>
  );
}

const chStyles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 16,
    elevation: 4,
  },
  guideCard: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    shadowColor: 'rgba(60,40,20,0.1)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  guideTitle: { fontSize: 14, fontWeight: '800' },
  phaseChip: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
});
