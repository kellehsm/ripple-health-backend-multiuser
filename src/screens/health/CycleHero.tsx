import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { coloredShadow } from '../../theme/styleUtils';
import { fmtDate, todayStr } from '../../utils/dateUtils';
import { Prediction, getPhaseLabel, PHASE_GUIDE } from './shared';
import { ProgressRing } from './AdherenceHero';
import { FONT_SIZES } from '../../theme/tokens';

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

const PHASE_COLORS: Record<string, (theme: any) => string> = {
  Menstrual:  (t) => t.cycle?.period    ?? '#D96C57',
  Follicular: (t) => t.cycle?.fertile   ?? '#6BBFB5',
  Ovulatory:  (t) => t.cycle?.ovulation ?? '#7B9FBF',
  Luteal:     (t) => t.cycle?.mood      ?? '#C9A0C0',
};

const PHASE_LENGTHS: Record<string, number> = {
  Menstrual: 5, Follicular: 6, Ovulatory: 5, Luteal: 12,
};
const TOTAL_PHASE_DAYS = Object.values(PHASE_LENGTHS).reduce((a, b) => a + b, 0);

export function PhaseGuideCard({ theme, currentPhase }: { theme: any; currentPhase: string }) {
  const [selected, setSelected] = React.useState(currentPhase);
  const guide = PHASE_GUIDE[selected];
  if (!guide) return null;
  const phases = Object.keys(PHASE_GUIDE);

  return (
    <View style={[chStyles.guideCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
      <Text style={[chStyles.guideTitle, { color: theme.textStrong }]}>Phase Guide</Text>

      {/* Segmented phase bar */}
      <View style={{ flexDirection: 'row', borderRadius: 8, overflow: 'hidden', marginTop: 10, height: 20 }}>
        {phases.map((p) => {
          const pct = PHASE_LENGTHS[p] / TOTAL_PHASE_DAYS;
          const color = PHASE_COLORS[p](theme);
          const isActive = p === selected;
          return (
            <View
              key={p}
              onTouchEnd={() => setSelected(p)}
              style={{
                flex: pct,
                backgroundColor: color,
                opacity: isActive ? 1 : 0.45,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {p === currentPhase && (
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', opacity: 0.9 }} />
              )}
            </View>
          );
        })}
      </View>

      {/* 2-column legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 0 }}>
        {phases.map((p, i) => {
          const color = PHASE_COLORS[p](theme);
          const isActive = p === selected;
          return (
            <View
              key={p}
              onTouchEnd={() => setSelected(p)}
              style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, opacity: isActive ? 1 : 0.55 }} />
              <Text style={{ color: isActive ? theme.textStrong : theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: isActive ? '800' : '500' }}>
                {PHASE_GUIDE[p].icon} {p}{p === currentPhase ? ' ←' : ''}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: '800', letterSpacing: 0.5, marginTop: 10, textTransform: 'uppercase' }}>
        {guide.days}{selected === currentPhase ? ' · You are here' : ''}
      </Text>
      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.body, lineHeight: 20, marginTop: 4 }}>{guide.body}</Text>
      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption - 1, marginTop: 8, fontStyle: 'italic' }}>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
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
