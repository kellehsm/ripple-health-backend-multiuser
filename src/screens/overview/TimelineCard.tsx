/**
 * overview/TimelineCard.tsx
 * The "Today's timeline" card: glucose chart + event list + scrubber.
 * Extracted from OverviewScreen.tsx — no logic changes.
 */
import React from "react";
import { View, Text, Pressable, StyleSheet, PanResponder } from "react-native";
import Svg, {
  Rect,
  Text as SvgText,
  Polyline,
  Circle,
  Line as SvgLine,
} from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { onSolid } from "../../theme/colorUtils";
import { ShadowCard } from "../../components/ShadowCard";
import { moodScoreEmoji } from "../../theme/iconRegistry";
import { fmtTime } from "../../utils/dateUtils";
import { BUCKET_LABEL, type MoodBucket } from "../../constants";
import {
  SkeletonBox,
  CHART_W,
  CHART_H,
  PAD_L,
  PAD_B,
  PAD_T,
  type PatternEvent,
  type GlucoseReading,
  type DayEvent,
  type Bucket,
} from "./shared";

interface Props {
  loading: boolean;
  dayGlucose: GlucoseReading[];
  yesterdayGlucose: GlucoseReading[];
  dayEvents: DayEvent[];
  patternEvents: PatternEvent[];
  showAllEvents: boolean;
  setShowAllEvents: (v: boolean) => void;
  glucoseOutOfRange: boolean;
  lastGlucoseVal: number | null;
  lastGlucoseReading: GlucoseReading | null;
  minVal: number;
  maxVal: number;
  windowStart: number;
  windowEnd: number;
  glucosePoints: string;
  yesterdayPoints: string;
  highBandY: number;
  lowBandY: number;
  usableH: number;
  scrub: { x: number; mgDl: number; yestMgDl: number | null; time: number } | null;
  panResponder: ReturnType<typeof PanResponder.create>;
  timelinePanResponder: ReturnType<typeof PanResponder.create>;
  timelineScrubberX: React.MutableRefObject<number>;
  timelineScrubberTime: string | null;
  tourTimelineRef: React.RefObject<View | null>;
  eventX: (t: number, ws: number, we: number) => number;
  glucoseY: (val: number, minVal: number, maxVal: number) => number;
  interpolateGlucose: (readings: GlucoseReading[], t: number) => number | null;
}

export function TimelineCard({
  loading,
  dayGlucose,
  yesterdayGlucose,
  dayEvents,
  patternEvents,
  showAllEvents,
  setShowAllEvents,
  glucoseOutOfRange,
  lastGlucoseVal,
  lastGlucoseReading,
  minVal,
  maxVal,
  windowStart,
  windowEnd,
  glucosePoints,
  yesterdayPoints,
  highBandY,
  lowBandY,
  usableH,
  scrub,
  panResponder,
  timelinePanResponder,
  timelineScrubberX,
  timelineScrubberTime,
  tourTimelineRef,
  eventX,
  glucoseY,
  interpolateGlucose,
}: Props) {
  const { theme, mode } = useTheme();
  const ink = theme.ink;

  const visibleEvents = showAllEvents ? patternEvents : patternEvents.slice(0, 8);

  function eventDotColor(type: PatternEvent["type"]): string {
    switch (type) {
      case "meal": return theme.coral.solid;
      case "mood": return theme.violet.solid;
      case "spend": return theme.purple.solid;
      case "glucose_spike": return theme.red.solid;
      case "water": return theme.blue.solid;
      case "hobby": return theme.teal.solid;
      default: return theme.textSoft;
    }
  }

  function eventIcon(type: PatternEvent["type"]): string {
    switch (type) {
      case "meal": return "restaurant";
      case "mood": return "happy-outline";
      case "spend": return "card-outline";
      case "glucose_spike": return "pulse";
      case "water": return "water-outline";
      case "hobby": return "barbell-outline";
      default: return "ellipse";
    }
  }

  function timelineWindowBounds() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime();
    const dayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime();
    return { dayStart, dayEnd };
  }

  return (
    <View ref={tourTimelineRef}>
    <ShadowCard size="card" bg={glucoseOutOfRange ? theme.red.tint : theme.card} accent={theme.berry.solid} cardId="timeline">
      <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Today's timeline</Text>
      {loading ? (
        <SkeletonBox style={{ height: CHART_H, marginBottom: 8 }} />
      ) : dayGlucose.length > 0 ? (
        <>
          <View {...panResponder.panHandlers} style={{ marginBottom: 6 }}>
            <Svg width={CHART_W} height={CHART_H} accessibilityLabel="Glucose chart">
              <Rect x={PAD_L} y={highBandY} width={CHART_W - PAD_L} height={lowBandY - highBandY} fill={mode === "dark" ? theme.berry.sub : theme.berry.tint} opacity={mode === "dark" ? 0.25 : 0.4} stroke={ink} strokeWidth={1} strokeDasharray="5,5" />
              <SvgText x={PAD_L - 3} y={highBandY + 4} fontSize={8} fill={theme.textSoft} textAnchor="end">180</SvgText>
              <SvgText x={PAD_L - 3} y={lowBandY + 4} fontSize={8} fill={theme.textSoft} textAnchor="end">70</SvgText>
              {yesterdayPoints ? (
                <Polyline points={yesterdayPoints} fill="none" stroke={theme.berry.bar} strokeWidth={1.5} strokeDasharray="5,4" opacity={0.4} />
              ) : null}
              {glucosePoints ? (
                <>
                  <Polyline points={glucosePoints} fill="none" stroke={ink} strokeWidth={3.5} />
                  <Polyline points={glucosePoints} fill="none" stroke={theme.berry.bar} strokeWidth={2} />
                </>
              ) : null}
              {lastGlucoseVal !== null && lastGlucoseReading ? (() => {
                const lx = eventX(new Date(lastGlucoseReading.recorded_at).getTime(), windowStart, windowEnd);
                const ly = glucoseY(lastGlucoseVal, minVal, maxVal);
                const isHigh = lastGlucoseVal > 180;
                const isLow = lastGlucoseVal < 70;
                const dotFill = isHigh ? theme.glucoseHigh : isLow ? theme.glucoseLow : theme.berry.bar;
                const labelX = lx + 6 + 26 > CHART_W ? lx - 32 : lx + 6;
                return (
                  <>
                    <Circle cx={lx} cy={ly} r={5} fill={dotFill} stroke={ink} strokeWidth={1.5} />
                    <Rect x={labelX} y={ly - 9} width={30} height={14} rx={4} fill={dotFill} opacity={0.92} />
                    <SvgText x={labelX + 15} y={ly + 2} fontSize={9} fontWeight="bold" fill="#fff" textAnchor="middle">{lastGlucoseVal}</SvgText>
                  </>
                );
              })() : null}
              {dayEvents.map(function (ev, i) {
                const t = new Date(ev.time).getTime();
                if (t < windowStart || t > windowEnd) return null;
                const x = eventX(t, windowStart, windowEnd);
                const gVal = interpolateGlucose(dayGlucose, t);
                const y = gVal !== null ? glucoseY(gVal, minVal, maxVal) : PAD_T + usableH;
                const markerText = ev.type === "spend" ? "$" : ev.type === "mood" && ev.mood_score ? moodScoreEmoji(ev.mood_score) : ev.type === "mood" ? "·" : "M";
                const markerBg = ev.type === "meal" ? theme.coral.tint : ev.type === "spend" ? theme.purple.tint : theme.violet.tint;
                return (
                  <React.Fragment key={i}>
                    <Circle cx={x} cy={y} r={9} fill={markerBg} stroke={ink} strokeWidth={2} />
                    <SvgText x={x} y={y + 4} fontSize={8} fill={ink} textAnchor="middle" fontWeight="bold">{markerText}</SvgText>
                  </React.Fragment>
                );
              })}
              {scrub && (() => {
                const cy = glucoseY(scrub.mgDl, minVal, maxVal);
                const hasYest = scrub.yestMgDl !== null;
                const delta = hasYest ? scrub.mgDl - scrub.yestMgDl! : null;
                const tipW = hasYest ? 90 : 68;
                const tipH = hasYest ? 50 : 30;
                const tipX = scrub.x + 10 + tipW > CHART_W ? scrub.x - tipW - 10 : scrub.x + 10;
                const tipY = PAD_T;
                const timeStr = new Date(scrub.time).getHours().toString().padStart(2, "0") + ":" + new Date(scrub.time).getMinutes().toString().padStart(2, "0");
                const deltaStr = delta !== null ? (delta >= 0 ? "+" : "") + delta + " vs 24h ago" : "";
                const deltaColor = delta === null ? ink : delta > 10 ? theme.berry.solid : delta < -10 ? theme.teal.solid : theme.textSoft;
                return (
                  <>
                    <SvgLine x1={scrub.x} y1={PAD_T} x2={scrub.x} y2={CHART_H - PAD_B} stroke={ink} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.6} />
                    <Circle cx={scrub.x} cy={cy} r={5} fill={theme.berry.solid} stroke={ink} strokeWidth={2} />
                    {hasYest && (
                      <Circle cx={scrub.x} cy={glucoseY(scrub.yestMgDl!, minVal, maxVal)} r={4} fill={theme.berry.bar} stroke={ink} strokeWidth={1.5} opacity={0.55} />
                    )}
                    <Rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} fill={theme.card} stroke={ink} strokeWidth={1.5} />
                    <SvgText x={tipX + tipW / 2} y={tipY + 13} fontSize={12} fontWeight="800" fill={theme.berry.solid} textAnchor="middle">{scrub.mgDl} mg/dL</SvgText>
                    <SvgText x={tipX + tipW / 2} y={tipY + 26} fontSize={9} fill={theme.textSoft} textAnchor="middle">{timeStr}</SvgText>
                    {hasYest && (
                      <>
                        <SvgText x={tipX + tipW / 2} y={tipY + 38} fontSize={9} fill={theme.textSoft} textAnchor="middle">24h ago: {scrub.yestMgDl}</SvgText>
                        {delta !== null && <SvgText x={tipX + tipW / 2} y={tipY + 49} fontSize={8} fontWeight="700" fill={deltaColor} textAnchor="middle">{deltaStr}</SvgText>}
                      </>
                    )}
                  </>
                );
              })()}
            </Svg>
          </View>
          <View style={[styles.legendRow, { marginBottom: 12 }]}>
            {[
              { color: theme.berry.bar, label: "Today", dash: false },
              ...(yesterdayGlucose.length > 0 ? [{ color: theme.berry.bar, label: "24h ago", dash: true }] : []),
              { color: theme.coral.tint, label: "Meal", dash: false },
              { color: theme.violet.tint, label: "Mood", dash: false },
              { color: theme.purple.tint, label: "Spend", dash: false },
            ].map(l => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.color, borderWidth: 1.5, borderColor: ink, opacity: l.dash ? 0.45 : 1 }]} />
                <Text style={{ color: theme.textSoft, fontSize: 10 }}>{l.label}</Text>
              </View>
            ))}
          </View>
        </>
      ) : (
        <View style={[styles.emptyState, { borderColor: ink }]}>
          <Ionicons name="pulse-outline" size={24} color={theme.textSoft} />
          <Text style={[styles.emptyText, { color: theme.textSoft }]}>No glucose readings yet — connect Dexcom in Settings to see your chart here</Text>
        </View>
      )}
      {loading ? (
        <View style={{ gap: 12 }}>
          <SkeletonBox style={{ height: 18, width: "70%" }} />
          <SkeletonBox style={{ height: 18, width: "55%" }} />
          <SkeletonBox style={{ height: 18, width: "80%" }} />
        </View>
      ) : patternEvents.length === 0 ? (
        <View style={[styles.emptyState, { borderColor: ink }]}>
          <Ionicons name="calendar-outline" size={24} color={theme.textSoft} />
          <Text style={[styles.emptyText, { color: theme.textSoft }]}>Log a meal, mood, or spend to start your day's timeline</Text>
        </View>
      ) : (
        <>
          {patternEvents.length > 0 && (() => {
            const { dayStart, dayEnd } = timelineWindowBounds();
            const thumbRatio = Math.max(0, Math.min(1, timelineScrubberX.current / (CHART_W - PAD_L)));
            const thumbX = thumbRatio * (CHART_W - PAD_L);
            const eventPositions = patternEvents.map(ev => {
              const t = new Date(ev.time).getTime();
              return Math.max(0, Math.min(CHART_W - PAD_L, ((t - dayStart) / (dayEnd - dayStart)) * (CHART_W - PAD_L)));
            });
            return (
              <View style={{ marginBottom: 10, marginTop: 4 }} {...timelinePanResponder.panHandlers}>
                {timelineScrubberTime && (
                  <View style={{
                    position: "absolute",
                    top: 0,
                    left: Math.max(0, thumbX - 18),
                    zIndex: 10,
                    backgroundColor: theme.card,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: ink,
                    paddingHorizontal: 5,
                    paddingVertical: 2,
                  }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: theme.textStrong }}>{timelineScrubberTime}</Text>
                  </View>
                )}
                <View style={{ height: 28, marginTop: 16, position: "relative" }}>
                  <View style={{ position: "absolute", left: 0, right: 0, top: 12, height: 2, backgroundColor: theme.cardBorder, borderRadius: 1 }} />
                  {eventPositions.map((xPos, ei) => (
                    <View key={ei} style={{
                      position: "absolute",
                      left: xPos - 3,
                      top: 9,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: eventDotColor(patternEvents[ei].type),
                      borderWidth: 1,
                      borderColor: ink,
                    }} />
                  ))}
                  <View style={{
                    position: "absolute",
                    left: thumbX - 1,
                    top: 0,
                    width: 2,
                    height: 28,
                    backgroundColor: ink,
                    borderRadius: 1,
                    opacity: 0.7,
                  }} />
                  <View style={{
                    position: "absolute",
                    left: thumbX - 7,
                    top: 6,
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: theme.teal.solid,
                    borderWidth: 2,
                    borderColor: ink,
                  }} />
                </View>
              </View>
            );
          })()}
          {visibleEvents.map(function (ev, i) {
            const dotColor = eventDotColor(ev.type);
            const icon = eventIcon(ev.type);
            const isLast = i === visibleEvents.length - 1;
            return (
              <View key={i} style={{ flexDirection: "row", minHeight: 36 }}>
                <Text style={[styles.tlTime, { color: theme.textSoft }]}>{fmtTime(ev.time)}</Text>
                <View style={{ width: 20, alignItems: "center", marginRight: 10 }}>
                  <View style={[styles.tlIconDot, { backgroundColor: dotColor }]}>
                    <Ionicons name={icon as any} size={9} color={onSolid(dotColor)} />
                  </View>
                  {!isLast && <View style={[styles.tlLine, { backgroundColor: theme.cardBorder }]} />}
                </View>
                <Text
                  style={{ flex: 1, color: theme.textStrong, fontSize: 13, fontWeight: "500", lineHeight: 18, paddingBottom: isLast ? 0 : 10 }}
                  numberOfLines={2}
                >
                  {ev.label}
                  {ev.type === "mood" && ev.entry_type === "period" && ev.period
                    ? " · " + BUCKET_LABEL[ev.period as Bucket]
                    : ""}
                </Text>
              </View>
            );
          })}
          {patternEvents.length > 8 ? (
            <Pressable onPress={() => setShowAllEvents(!showAllEvents)} style={{ paddingTop: 6 }}>
              <Text style={{ color: theme.teal.fg, fontSize: 12, fontWeight: "700" }}>
                {showAllEvents ? "Show less" : "Show all " + patternEvents.length + " events"}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
    </ShadowCard>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 19, fontWeight: "900", letterSpacing: -0.5 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  emptyState: {
    borderWidth: 2,
    borderRadius: 16,
    borderStyle: "dashed",
    paddingVertical: 18,
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  emptyText: { fontSize: 13, fontWeight: "500" },
  tlTime: { fontSize: 11, width: 42, paddingTop: 3 },
  tlIconDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  tlLine: { flex: 1, width: 2, marginTop: 2 },
});
