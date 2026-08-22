import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Dimensions } from "react-native";
import { isReducedMotion } from "../lib/motion";
import Svg, { G, Rect, Text as SvgText, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";

export type ChartDayData = {
  day_label: string;
  this_total: number;
  last_total: number;
  is_today: boolean;
  is_future: boolean;
};

type Props = {
  days: ChartDayData[];
  barColor: string;
  fadedColor: string;
  textColor: string;
  formatValue: (n: number) => string;
};

const SCREEN_W = Dimensions.get("window").width;
const PLOT_H = 150;
const LABEL_H = 20;
const CHART_H = PLOT_H + LABEL_H;

export const WeekComparisonChart = React.memo(function WeekComparisonChart({ days, barColor, fadedColor, textColor }: Props) {
  const chartW = SCREEN_W - 32;
  const slotW = chartW / 7;
  const barW = Math.max(Math.floor(slotW * 0.33), 6);
  const gap = 3;

  const maxVal = Math.max(...days.map((d) => d.this_total), ...days.map((d) => d.last_total), 1);

  // Per-bar geometry (slot positions and full heights) — stable across animation ticks
  const barGeo = useMemo(() => days.map((day, i) => {
    const slotX = i * slotW;
    const barsW = barW * 2 + gap;
    const startX = slotX + (slotW - barsW) / 2;
    const lastX = startX;
    const thisX = startX + barW + gap;
    const centerX = slotX + slotW / 2;
    const lastHFull = day.last_total > 0 ? Math.max((day.last_total / maxVal) * PLOT_H, 3) : 0;
    const thisHFull = !day.is_future && day.this_total > 0 ? Math.max((day.this_total / maxVal) * PLOT_H, 3) : 0;
    return { lastX, thisX, centerX, lastHFull, thisHFull };
  }), [days, slotW, barW, gap, maxVal]);

  // One Animated.Value per bar (index 0..6), representing a 0→1 progress multiplier.
  const progRefs = useRef<Animated.Value[]>([]);
  if (progRefs.current.length !== days.length) {
    progRefs.current = days.map(() => new Animated.Value(0));
  }

  // Track the data identity so we only re-animate when data actually changes.
  const dataKeyRef = useRef<string>("");
  const dataKey = days.map((d) => `${d.this_total}:${d.last_total}`).join(",");

  useEffect(() => {
    if (dataKey === dataKeyRef.current) return;
    dataKeyRef.current = dataKey;

    if (isReducedMotion()) {
      // Jump all bars to full height immediately
      progRefs.current.forEach((av) => av.setValue(1));
      return;
    }

    // Reset all to 0 first.
    progRefs.current.forEach((av) => av.setValue(0));

    // Staggered spring to 1.
    const animations = progRefs.current.map((av, i) =>
      Animated.sequence([
        Animated.delay(i * 35),
        Animated.timing(av, {
          toValue: 1,
          duration: 350,
          useNativeDriver: false,
        }),
      ])
    );
    Animated.parallel(animations).start();
  }, [dataKey]);

  // We use a stateful re-render approach: listen to each animated value and
  // store the current progress array in state so SVG re-renders with new heights.
  const [progValues, setProgValues] = React.useState<number[]>(() => days.map(() => 0));

  useEffect(() => {
    const listeners = progRefs.current.map((av, i) =>
      av.addListener(({ value }) => {
        setProgValues((prev) => {
          const next = [...prev];
          next[i] = value;
          return next;
        });
      })
    );
    return () => {
      progRefs.current.forEach((av, i) => av.removeListener(listeners[i]));
    };
  }, [days.length]);

  const thisWeekTotal = days.reduce((s, d) => s + (d.is_future ? 0 : d.this_total), 0);
  const lastWeekTotal = days.reduce((s, d) => s + d.last_total, 0);

  return (
    <Svg
      width={chartW}
      height={CHART_H}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Week comparison chart: this week ${thisWeekTotal}, last week ${lastWeekTotal}`}
    >
      <Defs>
        <SvgLinearGradient id="wkBarThisFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={barColor} stopOpacity="1" />
          <Stop offset="1" stopColor={barColor} stopOpacity="0.55" />
        </SvgLinearGradient>
        <SvgLinearGradient id="wkBarLastFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fadedColor} stopOpacity="1" />
          <Stop offset="1" stopColor={fadedColor} stopOpacity="0.55" />
        </SvgLinearGradient>
      </Defs>
      {days.map((day, i) => {
        const { lastX, thisX, centerX, lastHFull, thisHFull } = barGeo[i] ?? { lastX: 0, thisX: 0, centerX: 0, lastHFull: 0, thisHFull: 0 };
        const prog = progValues[i] ?? 0;
        const lastH = lastHFull * prog;
        const thisH = thisHFull * prog;

        return (
          <G key={i}>
            {lastHFull > 0 && lastH > 0 && (
              <Rect
                x={lastX}
                y={PLOT_H - lastH}
                width={barW}
                height={lastH}
                rx={3}
                fill="url(#wkBarLastFill)"
              />
            )}

            {!day.is_future && thisHFull > 0 && thisH > 0 && (
              <Rect
                x={thisX}
                y={PLOT_H - thisH}
                width={barW}
                height={thisH}
                rx={3}
                fill="url(#wkBarThisFill)"
                opacity={day.is_today ? 0.55 : 1}
              />
            )}

            {day.is_today && thisH > 0 && (
              <Rect
                x={thisX}
                y={PLOT_H - thisH}
                width={barW}
                height={thisH}
                rx={3}
                fill="none"
                stroke={barColor}
                strokeWidth={1.5}
                strokeDasharray="3,2"
              />
            )}

            <SvgText
              x={centerX}
              y={CHART_H - 3}
              fontSize={10}
              fill={day.is_today ? barColor : textColor}
              textAnchor="middle"
              fontWeight={day.is_today ? "600" : "normal"}
            >
              {day.day_label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
});
