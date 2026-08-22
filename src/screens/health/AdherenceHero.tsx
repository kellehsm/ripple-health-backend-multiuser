import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Animated, Easing, LayoutAnimation, Platform, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import * as Haptics from 'expo-haptics';
import { api } from '../../api/client';
import { coloredShadow } from '../../theme/styleUtils';
import { addDays, todayStr } from '../../utils/dateUtils';

interface AdherenceDay { day: string; expected: number; taken: number }
interface MissedSlot { slot_id: string; time_of_day: string; medication_id: string; name: string; dosage: string | null }
interface AdherenceData {
  adherence7: number | null;
  adherence30: number | null;
  streak: number;
  perfectDays30: number;
  days: AdherenceDay[];
  perMed: Array<{ id: string; name: string; expected: number; taken: number; pct: number | null }>;
  yesterdayMissed: MissedSlot[];
}

export function ProgressRing({ size, stroke, progress, color, track, children }: {
  size: number; stroke: number; progress: number; color: string; track: string; children?: React.ReactNode;
}) {
  const { r, c } = useMemo(() => {
    const radius = (size - stroke) / 2;
    return { r: radius, c: 2 * Math.PI * radius };
  }, [size, stroke]);
  const clamped = Math.max(0, Math.min(1, progress));
  const anim = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // SVG props can't use the native driver
    Animated.timing(anim, { toValue: clamped, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [clamped, anim]);
  const dashOffset = anim.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${c}`} strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  );
}

export function AdherenceHero({
  theme,
  takenToday,
  totalToday,
  refresh,
  onChanged,
}: {
  theme: any;
  takenToday: number;
  totalToday: number;
  refresh: number;
  onChanged: () => void;
}) {
  const [data, setData] = useState<AdherenceData | null>(null);
  const [missedDismissed, setMissedDismissed] = useState(false);
  const [missedExpanded, setMissedExpanded] = useState(false);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    api.getMedicationAdherence().then((res: any) => setData(res ?? null)).catch(() => setData(null));
  }, [refresh]);

  if (!data) return null;
  const anyExpected = data.days.some((d) => d.expected > 0);
  if (!anyExpected && totalToday === 0) return null;

  const teal = theme.teal;
  const yesterday = addDays(todayStr(), -1);

  async function markYesterdayTaken(missed: MissedSlot[]) {
    setMarking(true);
    try {
      await api.markSelectedTaken(missed.map((m) => m.slot_id), yesterday);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onChanged();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed');
    } finally {
      setMarking(false);
    }
  }

  const ringProgress = totalToday > 0 ? takenToday / totalToday : 0;
  const allDoneToday = totalToday > 0 && takenToday >= totalToday;

  // Last 12 weeks heatmap — 12 columns of 7 days each, oldest first
  const weeks: AdherenceDay[][] = [];
  for (let i = 0; i < data.days.length; i += 7) {
    weeks.push(data.days.slice(i, i + 7));
  }

  function cellColor(d: AdherenceDay): { bg: string; opacity: number } {
    if (d.expected === 0) return { bg: theme.cardBorder, opacity: 0.35 };
    if (d.taken >= d.expected) return { bg: teal.solid, opacity: 1 };
    if (d.taken > 0) return { bg: teal.solid, opacity: 0.45 };
    return { bg: theme.coral?.sub ?? '#E8654E', opacity: 0.3 };
  }

  const missed = data.yesterdayMissed ?? [];
  const showMissedBanner = missed.length > 0 && !missedDismissed;

  return (
    <View style={{ gap: 12 }}>
      {/* Missed-dose banner — slim row with expandable detail sheet */}
      {showMissedBanner && (
        <View style={[heroStyles.missedBanner, { backgroundColor: theme.amber?.bg ?? '#FEF3E2', borderColor: theme.amber?.solid ?? '#D97706', padding: 0, overflow: 'hidden' }]}>
          {/* Slim header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, gap: 8 }}>
            <Text style={{ fontSize: 13 }}>⏳</Text>
            <Text style={{ color: theme.amber?.fg ?? '#92400E', fontSize: 13, fontWeight: '800', flex: 1 }} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>
              {missed.length} missed {missed.length === 1 ? 'dose' : 'doses'} from yesterday
            </Text>
            <Pressable
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setMissedExpanded((v) => !v);
              }}
              hitSlop={8}
              style={[heroStyles.missedBtn, { backgroundColor: theme.amber?.solid ?? '#D97706', borderColor: 'transparent', paddingVertical: 4, paddingHorizontal: 10 }]}
              accessibilityRole="button"
              accessibilityLabel={missedExpanded ? 'Collapse missed dose details' : 'Review missed doses'}
            >
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{missedExpanded ? 'Close' : 'Review'}</Text>
            </Pressable>
            <Pressable onPress={() => setMissedDismissed(true)} hitSlop={8} accessibilityLabel="Dismiss missed dose alert">
              <Text style={{ color: theme.amber?.fg ?? '#92400E', fontWeight: '700', fontSize: 18, lineHeight: 20 }}>×</Text>
            </Pressable>
          </View>
          {/* Expanded detail */}
          {missedExpanded && (
            <View style={{ borderTopWidth: 1, borderTopColor: theme.amber?.solid ?? '#D97706', paddingHorizontal: 12, paddingBottom: 10, gap: 6, paddingTop: 8 }}>
              {missed.map((m) => (
                <Text key={m.slot_id} style={{ color: theme.amber?.fg ?? '#92400E', fontSize: 12 }}>
                  • {m.name}{m.dosage ? ` ${m.dosage}` : ''} ({m.time_of_day})
                </Text>
              ))}
              <Pressable
                style={[heroStyles.missedBtn, { backgroundColor: theme.amber?.solid ?? '#D97706', borderColor: 'transparent', alignSelf: 'flex-start', marginTop: 4 }]}
                disabled={marking}
                onPress={() => markYesterdayTaken(missed)}
                accessibilityRole="button"
                accessibilityLabel="Mark yesterday's missed doses as taken"
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{marking ? 'Marking…' : 'I took them'}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Hero card */}
      <View style={[heroStyles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, ...coloredShadow(teal.solid) }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <ProgressRing size={84} stroke={9} progress={ringProgress} color={teal.solid} track={teal.tint}>
            {totalToday > 0 ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: theme.textStrong, fontSize: 18, fontWeight: '900' }} allowFontScaling maxFontSizeMultiplier={1.2}>
                  {allDoneToday ? '✓' : `${takenToday}/${totalToday}`}
                </Text>
                <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>TODAY</Text>
              </View>
            ) : (
              <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: '700' }}>No doses</Text>
            )}
          </ProgressRing>

          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <View>
                <Text style={{ color: teal.fg, fontSize: 20, fontWeight: '900' }} allowFontScaling maxFontSizeMultiplier={1.2}>
                  {data.adherence7 != null ? `${data.adherence7}%` : '—'}
                </Text>
                <Text style={[heroStyles.statLabel, { color: theme.textSoft }]}>7 days</Text>
              </View>
              <View>
                <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: '900' }} allowFontScaling maxFontSizeMultiplier={1.2}>
                  {data.adherence30 != null ? `${data.adherence30}%` : '—'}
                </Text>
                <Text style={[heroStyles.statLabel, { color: theme.textSoft }]}>30 days</Text>
              </View>
            </View>
            {data.streak > 0 && (
              <Text style={{ color: theme.textStrong, fontSize: 12, fontWeight: '700' }} allowFontScaling maxFontSizeMultiplier={1.3}>
                🔥 {data.streak}-day streak
              </Text>
            )}
            {data.perfectDays30 > 0 && (
              <Text style={{ color: theme.textSoft, fontSize: 11 }} allowFontScaling maxFontSizeMultiplier={1.3}>
                ✨ {data.perfectDays30} perfect {data.perfectDays30 === 1 ? 'day' : 'days'} in the last 30
              </Text>
            )}
          </View>
        </View>

        {/* 12-week heatmap with day-of-week axis labels */}
        {anyExpected && (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {/* Day-of-week labels column */}
              <View style={{ gap: 3, width: 14 }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <View key={i} style={{ aspectRatio: 1, width: 14, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: theme.textSoft, fontSize: 7, fontWeight: '700' }}>{d}</Text>
                  </View>
                ))}
              </View>
              {/* Week columns */}
              <View style={{ flexDirection: 'row', gap: 3, flex: 1, justifyContent: 'space-between' }}>
                {weeks.map((week, wi) => (
                  <View key={wi} style={{ gap: 3, flex: 1 }}>
                    {week.map((d) => {
                      const { bg, opacity } = cellColor(d);
                      return (
                        <View key={d.day} style={{ aspectRatio: 1, borderRadius: 3, backgroundColor: bg, opacity }} />
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, alignItems: 'center' }}>
              <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 }}>LAST 12 WEEKS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: theme.coral?.sub ?? '#E8654E', opacity: 0.3 }} />
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: teal.solid, opacity: 0.45 }} />
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: teal.solid }} />
                <Text style={{ color: theme.textSoft, fontSize: 9 }}>missed → all taken</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  card: {
    borderRadius: 26,
    borderWidth: 2,
    padding: 16,
    elevation: 4,
  },
  statLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  missedBanner: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 22,
    borderWidth: 2,
    padding: 14,
  },
  missedBtn: {
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
