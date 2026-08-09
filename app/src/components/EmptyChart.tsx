/**
 * Empty-chart illustration.
 *
 * When a metric hasn't accumulated enough data to plot, show a stylized
 * placeholder line that hints at what a filled chart will eventually look
 * like — much friendlier than "No data yet".
 *
 * Uses SVG so it inherits the metric color and stays crisp at any size.
 */

import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { ScaledText } from "./ScaledText";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  color: string;
  message?: string;
  height?: number;
}

export function EmptyChart({ color, message = "Log a few days to see this chart come alive", height = 140 }: Props) {
  const { theme } = useTheme();
  const width = 220;
  // Pre-baked wavy path that suggests a friendly upward trend without
  // implying any specific pattern.
  const wave = `M 5,${height - 20}
    C 40,${height - 15} 60,${height - 55} 90,${height - 45}
    S 140,${height - 80} 165,${height - 60}
    S 200,${height - 100} 215,${height - 80}`;

  return (
    <View style={[styles.wrap, { height: height + 40 }]}>
      <Svg width={width} height={height} style={{ opacity: 0.35 }}>
        <Path d={wave} stroke={color} strokeWidth={2} fill="none" strokeDasharray="4,5" strokeLinecap="round" />
        {[5, 90, 165, 215].map((x, i) => (
          <Circle key={i} cx={x} cy={height - 20 - i * 15} r={3} fill={color} opacity={0.5} />
        ))}
      </Svg>
      <ScaledText size={12} color={theme.textSoft} center style={styles.msg}>{message}</ScaledText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 16 },
  msg:  { paddingHorizontal: 24 },
});
