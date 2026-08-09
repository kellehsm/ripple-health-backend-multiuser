/**
 * Sparkline — a tiny time-series line under a metric tile.
 *
 * Pure SVG (react-native-svg). No animation, no scale — designed to be
 * dropped under any number on the dashboard for instant context.
 *
 * For interactive charts (scrub, pinch), a Skia primitive is planned;
 * this ships now, unblocks §3.6.
 */

import React from "react";
import { View } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";

interface Props {
  data: number[];             // ordered oldest → newest
  width?: number;
  height?: number;
  color: string;
  fillOpacity?: number;
  showLastDot?: boolean;
  strokeWidth?: number;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  color,
  fillOpacity = 0.15,
  showLastDot = true,
  strokeWidth = 1.5,
}: Props) {
  const clean = data.filter((v) => Number.isFinite(v));
  if (clean.length < 2) {
    return <View style={{ width, height }} />;
  }

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;

  const stepX = width / (clean.length - 1);
  const points = clean.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return { x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${(points[points.length - 1].x).toFixed(1)},${height} L0,${height} Z`;

  const last = points[points.length - 1];

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path d={area} fill={color} fillOpacity={fillOpacity} />
        <Path d={line} stroke={color} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {showLastDot && (
          <Circle cx={last.x} cy={last.y} r={2.4} fill={color} />
        )}
      </Svg>
    </View>
  );
}
