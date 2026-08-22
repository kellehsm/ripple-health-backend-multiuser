import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { api } from '../../api/client';
import { addDays, fmtDate, formatDateLocal, todayStr } from '../../utils/dateUtils';
import { FLOW_COLORS } from '../../constants';
import { CycleLog, Prediction } from './shared';

export function MonthCalendar({
  theme,
  onDayPress,
  refreshKey,
}: {
  theme: any;
  onDayPress: (date: string) => void;
  refreshKey?: number;
}) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [logs, setLogs] = useState<CycleLog[]>([]);
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const today = todayStr();

  useEffect(() => {
    // Local date formatting — toISOString() shifts to the previous UTC day in
    // western timezones, which silently excluded the month's last day.
    const from = formatDateLocal(firstDay);
    const to = formatDateLocal(lastDay);
    api.getCycleLogs(from, to).then((res: any) => setLogs(res ?? [])).catch(() => setLogs([]));
    api.getCyclePrediction().then((res: any) => setPrediction(res)).catch(() => setPrediction(null));
  }, [year, month, refreshKey]);

  function prevMonth() {
    setCurrentMonth(({ year: y, month: m }) => m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 });
  }
  function nextMonth() {
    setCurrentMonth(({ year: y, month: m }) => m === 11 ? { year: y + 1, month: 0 } : { year: y, month: m + 1 });
  }

  // Build log map
  const logMap: Record<string, CycleLog> = {};
  for (const log of logs) {
    logMap[log.log_date] = log;
  }

  // Build predicted period dates set (only future — past predictions are noise)
  const predictedDays = new Set<string>();
  const predictedStartDay = prediction?.predictedNextStart ?? null;
  if (predictedStartDay && predictedStartDay >= today) {
    const periodLen = prediction!.avgPeriodLength ?? 5;
    const periodEnd = prediction?.predictedPeriodEnd ?? addDays(predictedStartDay, periodLen - 1);
    for (let d = predictedStartDay; d <= periodEnd; d = addDays(d, 1)) {
      predictedDays.add(d);
    }
  }

  // Fertile window + ovulation day (only when upcoming/current)
  const fertileDays = new Set<string>();
  let ovulationDay: string | null = null;
  if (prediction?.fertileWindowStart && prediction.fertileWindowEnd && prediction.fertileWindowEnd >= today) {
    for (let d = prediction.fertileWindowStart; d <= prediction.fertileWindowEnd; d = addDays(d, 1)) {
      fertileDays.add(d);
    }
    ovulationDay = prediction.ovulationDay ?? null;
  }

  const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const cells: Array<number | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={[calStyles.container, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowColor: "rgba(60,40,20,0.1)" }]}>
      <View style={calStyles.header}>
        <Pressable onPress={prevMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous month"><Text style={{ color: theme.textStrong, fontSize: 20 }}>‹</Text></Pressable>
        <Text style={[calStyles.monthLabel, { color: theme.textStrong }]}>{monthLabel}</Text>
        <Pressable onPress={nextMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next month"><Text style={{ color: theme.textStrong, fontSize: 20 }}>›</Text></Pressable>
      </View>
      <View style={calStyles.dowRow}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <Text key={d} style={[calStyles.dowLabel, { color: theme.textSoft }]}>{d}</Text>
        ))}
      </View>
      <View style={calStyles.grid}>
        {cells.map((day, idx) => {
          if (day === null) return <View key={'empty-' + idx} style={calStyles.cell} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const log = logMap[dateStr];
          const isToday = dateStr === today;
          const isPredicted = predictedDays.has(dateStr);

          const isPeriodDay = !!(log?.flow_intensity && log.flow_intensity !== 'none');
          const flowBg = isPeriodDay ? (FLOW_COLORS[log!.flow_intensity!] ?? theme.cycle.period) : undefined;
          const hasSymptomLog = (log?.symptoms ?? []).length > 0;
          const hasMoodLog = log?.mood_label != null && log.mood_label !== '';
          // Map mood label to opacity for the subtle cell tint (higher mood = more visible)
          const moodLabelLower = (log?.mood_label ?? '').toLowerCase();
          const moodTintOpacity = hasMoodLog
            ? moodLabelLower.includes('great') || moodLabelLower.includes('excellent') || moodLabelLower.includes('amazing') ? 0.28
              : moodLabelLower.includes('good') || moodLabelLower.includes('happy') ? 0.22
              : moodLabelLower.includes('okay') || moodLabelLower.includes('ok') || moodLabelLower.includes('neutral') ? 0.14
              : moodLabelLower.includes('low') || moodLabelLower.includes('sad') || moodLabelLower.includes('bad') ? 0.08
              : 0.16
            : 0;

          const isPredictedStart = dateStr === predictedStartDay;
          const isOtherPredicted = isPredicted && !isPredictedStart;
          const isFertile = fertileDays.has(dateStr) && !isPredicted;
          const isOvulation = dateStr === ovulationDay;

          const parts: string[] = [];
          if (isPeriodDay) parts.push(`period logged: ${log!.flow_intensity} flow`);
          if (isPredictedStart) parts.push('predicted period start');
          else if (isOtherPredicted) parts.push('predicted period day');
          if (isOvulation) parts.push('estimated ovulation day');
          else if (isFertile) parts.push('predicted fertile window');
          if (hasSymptomLog) parts.push(`symptoms: ${(log!.symptoms ?? []).join(', ')}`);
          if (hasMoodLog) parts.push(`mood: ${log!.mood_label}`);
          const cellLabel = `${fmtDate(dateStr)}${isToday ? ', today' : ''}${parts.length ? ', ' + parts.join(', ') : ''}. Double tap to log or edit.`;

          return (
            <Pressable
              key={dateStr}
              style={calStyles.cell}
              onPress={() => onDayPress(dateStr)}
              accessibilityRole="button"
              accessibilityLabel={cellLabel}
            >
              {/* Predicted start day — solid saturated lavender fill */}
              {!isPeriodDay && isPredictedStart && (
                <View style={[calStyles.cellInner, { backgroundColor: theme.cycle.predicted, borderRadius: 8 }]} />
              )}
              {/* Remaining predicted period days — lighter lavender */}
              {!isPeriodDay && isOtherPredicted && (
                <View style={[calStyles.cellInner, { backgroundColor: theme.cycle.predicted, opacity: 0.45, borderRadius: 8 }]} />
              )}
              {/* Fertile window — light fill; dashed ring marks estimated ovulation */}
              {!isPeriodDay && isFertile && (
                <View style={[calStyles.cellInner, { backgroundColor: theme.cycle.fertile, borderRadius: 8 }]} />
              )}
              {!isPeriodDay && isOvulation && (
                <View style={[calStyles.cellInner, { borderColor: theme.cycle.ovulation, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 8 }]} />
              )}
              {/* Mood tint — subtle background wash when mood was logged that day */}
              {hasMoodLog && moodTintOpacity > 0 && (
                <View style={[calStyles.cellInner, { backgroundColor: theme.cycle.mood, opacity: moodTintOpacity, borderRadius: 8 }]} />
              )}
              {/* Period fill — flow intensity gradient color */}
              {isPeriodDay && (
                <View style={[calStyles.cellInner, { backgroundColor: flowBg, borderRadius: 8 }]} />
              )}
              {/* Today purple ring */}
              {isToday && (
                <View style={[calStyles.cellInner, { borderWidth: 2, borderColor: theme.cycle.predicted, borderRadius: 8 }]} />
              )}

              <Text style={[calStyles.dayText, { color: theme.textStrong }]}>{day}</Text>

              {/* Bottom-right: symptom dot (teal) */}
              {hasSymptomLog && (
                <View style={[calStyles.dotBR, { backgroundColor: theme.cycle.symptom }]} />
              )}
              {/* Bottom-left: mood dot (pink) */}
              {hasMoodLog && (
                <View style={[calStyles.dotBL, { backgroundColor: theme.cycle.mood }]} />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Legend */}
      <View style={calStyles.legend}>
        <View style={calStyles.legendItem}>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {(['spotting', 'light', 'medium', 'heavy'] as const).map((f) => (
              <View key={f} style={[calStyles.legendSwatch, { backgroundColor: FLOW_COLORS[f] }]} />
            ))}
          </View>
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Period</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: theme.cycle.predicted }]} />
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Next period</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: theme.cycle.fertile, borderWidth: 1.5, borderColor: theme.cycle.ovulation, borderStyle: 'dashed' }]} />
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Fertile window</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: theme.cycle.symptom }]} />
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Symptoms</Text>
        </View>
        <View style={calStyles.legendItem}>
          <View style={[calStyles.legendDot, { backgroundColor: theme.cycle.mood }]} />
          <Text style={[calStyles.legendText, { color: theme.textSoft }]}>Mood</Text>
        </View>
      </View>
    </View>
  );
}

const calStyles = StyleSheet.create({
  container: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 14,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  monthLabel: { fontSize: 15, fontWeight: '800' },
  dowRow: { flexDirection: 'row', marginBottom: 4 },
  dowLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  cellInner: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
  },
  dayText: { fontSize: 12, fontWeight: '500', zIndex: 1 },
  dotBR: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    zIndex: 2,
  },
  dotBL: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    zIndex: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.07)',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendSwatch: { width: 8, height: 10, borderRadius: 2 },
  legendText: { fontSize: 11 },
});
