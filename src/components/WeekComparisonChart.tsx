import React from "react";
import { Dimensions } from "react-native";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

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

export function WeekComparisonChart({ days, barColor, fadedColor, textColor }: Props) {
  const chartW = SCREEN_W - 32;
  const slotW = chartW / 7;
  const barW = Math.max(Math.floor(slotW * 0.33), 6);
  const gap = 3;

  const maxVal = Math.max(...days.map((d) => d.this_total), ...days.map((d) => d.last_total), 1);

  return (
    <Svg width={chartW} height={CHART_H}>
      {days.map((day, i) => {
        const slotX = i * slotW;
        const barsW = barW * 2 + gap;
        const startX = slotX + (slotW - barsW) / 2;
        const lastX = startX;
        const thisX = startX + barW + gap;
        const centerX = slotX + slotW / 2;

        const lastH = day.last_total > 0 ? Math.max((day.last_total / maxVal) * PLOT_H, 3) : 0;
        const thisH =
          !day.is_future && day.this_total > 0
            ? Math.max((day.this_total / maxVal) * PLOT_H, 3)
            : 0;

        return (
          <G key={i}>
            {lastH > 0 && (
              <Rect
                x={lastX}
                y={PLOT_H - lastH}
                width={barW}
                height={lastH}
                rx={2}
                fill={fadedColor}
              />
            )}

            {!day.is_future && thisH > 0 && (
              <Rect
                x={thisX}
                y={PLOT_H - thisH}
                width={barW}
                height={thisH}
                rx={2}
                fill={barColor}
                opacity={day.is_today ? 0.55 : 1}
              />
            )}

            {day.is_today && thisH > 0 && (
              <Rect
                x={thisX}
                y={PLOT_H - thisH}
                width={barW}
                height={thisH}
                rx={2}
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
}
