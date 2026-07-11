import React, { useState, useEffect } from "react";
import { ScrollView, View, Text, StyleSheet } from "react-native";
import Svg, { Line, Polyline, Text as SvgText } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { MetricCard } from "../components/MetricCard";
import { api } from "../api/client";

const USER_ID = "f2cde901-feae-443e-abed-ddf7302bb131";

const CHART_HEIGHT = 180;
const PAD = { left: 36, right: 10, top: 10, bottom: 18 };
const GLUCOSE_MIN = 60;
const GLUCOSE_MAX = 240;
const GRID_STEP = 20;

const TREND_ARROWS: Record<string, string> = {
  DoubleUp: "↑↑", SingleUp: "↑", FortyFiveUp: "↗",
  Flat: "→",
  FortyFiveDown: "↘", SingleDown: "↓", DoubleDown: "↓↓",
  None: "–",
};

type GlucoseReading = { id: string; user_id: string; recorded_at: string; mg_dl: number; trend: string | null };

function toY(mgdl: number): number {
  const ratio = (GLUCOSE_MAX - mgdl) / (GLUCOSE_MAX - GLUCOSE_MIN);
  return PAD.top + ratio * (CHART_HEIGHT - PAD.top - PAD.bottom);
}

// Steps/sleep/water/heart rate come from Health Connect. Glucose from Dexcom.
export function HealthScreen() {
  const { theme } = useTheme();
  const [glucoseData, setGlucoseData] = useState<GlucoseReading[]>([]);
  const [chartWidth, setChartWidth] = useState(300);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    api.glucoseToday(USER_ID, today)
      .then((data: GlucoseReading[]) => setGlucoseData(data))
      .catch(() => {});
  }, []);

  const latest = glucoseData.length > 0 ? glucoseData[glucoseData.length - 1] : null;
  const prev = glucoseData.length > 1 ? glucoseData[glucoseData.length - 2] : null;
  const minsAgo = latest ? Math.round((Date.now() - new Date(latest.recorded_at).getTime()) / 60000) : null;
  const delta = latest && prev ? latest.mg_dl - prev.mg_dl : null;
  const trendArrow = latest?.trend ? (TREND_ARROWS[latest.trend] ?? "→") : "";

  const effectiveW = chartWidth - PAD.left - PAD.right;

  const toX = (index: number) =>
    PAD.left + (index / Math.max(glucoseData.length - 1, 1)) * effectiveW;

  const polylinePoints = glucoseData
    .map((r, i) => `${toX(i)},${toY(r.mg_dl)}`)
    .join(" ");

  const gridValues = Array.from(
    { length: (GLUCOSE_MAX - GLUCOSE_MIN) / GRID_STEP + 1 },
    (_, i) => GLUCOSE_MIN + i * GRID_STEP,
  );

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        <MetricCard label="Steps" value="8,412" icon="walk" colorKey="teal" />
        <MetricCard label="Sleep" value="7h 12m" icon="moon" colorKey="amber" />
        <MetricCard label="Water" value="5 / 8" icon="water" colorKey="blue" />
        <MetricCard label="Heart rate" value="68 bpm" icon="pulse" colorKey="red" />
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]}>Glucose today</Text>

        {/* Current reading box */}
        <View style={[styles.readingBox, { backgroundColor: theme.red.bg }]}>
          <View style={styles.readingLeft}>
            <View style={styles.readingValueRow}>
              <Text style={[styles.readingValue, { color: theme.red.fg }]}>
                {latest ? `${latest.mg_dl}` : "––"}
              </Text>
              <Text style={[styles.readingUnit, { color: theme.red.sub }]}> mg/dL</Text>
              {trendArrow ? (
                <Text style={[styles.trendArrow, { color: theme.red.fg }]}>{trendArrow}</Text>
              ) : null}
            </View>
            <Text style={[styles.readingAgo, { color: theme.red.sub }]}>
              {minsAgo !== null ? `as of ${minsAgo} min ago` : "no reading yet"}
            </Text>
          </View>
          {delta !== null && (
            <Text style={[styles.readingDelta, { color: theme.red.sub }]}>
              {delta >= 0 ? `+${delta}` : `${delta}`} from last
            </Text>
          )}
        </View>

        {/* SVG chart */}
        <View
          style={[styles.chartContainer, { height: CHART_HEIGHT }]}
          onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        >
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            {/* Horizontal gridlines */}
            {gridValues.map((val) => (
              <React.Fragment key={val}>
                <Line
                  x1={PAD.left}
                  y1={toY(val)}
                  x2={chartWidth - PAD.right}
                  y2={toY(val)}
                  stroke={theme.cardBorder}
                  strokeWidth={0.5}
                  strokeDasharray="2,3"
                />
                <SvgText
                  x={PAD.left - 4}
                  y={toY(val) + 3}
                  textAnchor="end"
                  fontSize={8}
                  fill={theme.textSoft}
                >
                  {val}
                </SvgText>
              </React.Fragment>
            ))}

            {/* High threshold line (180) – slightly tinted */}
            <Line
              x1={PAD.left}
              y1={toY(180)}
              x2={chartWidth - PAD.right}
              y2={toY(180)}
              stroke={theme.red.sub}
              strokeWidth={0.5}
              strokeDasharray="2,3"
              opacity={0.45}
            />

            {/* Low threshold line (70) */}
            <Line
              x1={PAD.left}
              y1={toY(70)}
              x2={chartWidth - PAD.right}
              y2={toY(70)}
              stroke={theme.amber.sub}
              strokeWidth={0.5}
              strokeDasharray="2,3"
              opacity={0.45}
            />

            {/* Data line */}
            {glucoseData.length >= 2 && (
              <Polyline
                points={polylinePoints}
                fill="none"
                stroke={theme.red.sub}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </Svg>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, marginTop: 4 },
  cardTitle: { fontSize: 14, fontWeight: "500", marginBottom: 10 },

  readingBox: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  readingLeft: { flex: 1 },
  readingValueRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  readingValue: { fontSize: 28, fontWeight: "500" },
  readingUnit: { fontSize: 13 },
  trendArrow: { fontSize: 20, marginLeft: 4 },
  readingAgo: { fontSize: 11, marginTop: 3 },
  readingDelta: { fontSize: 13, fontWeight: "500" },

  chartContainer: { width: "100%", marginTop: 4 },
});
