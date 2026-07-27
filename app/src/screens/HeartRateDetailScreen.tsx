import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import Svg, { Line, Polyline, Text as SvgText } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";


type HRReading = { recorded_at: string; bpm: number };
type DayRow = {
  date: string;
  resting_bpm: number;
  peak_bpm: number;
  avg_bpm: number;
  reading_count: number;
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_W = SCREEN_WIDTH - 64;
const CHART_H = 180;
const PAD_L = 36;
const PAD_B = 20;
const PAD_T = 12;
const RANGE_OPTIONS = [3, 6, 12, 24];

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return (d.getMonth() + 1) + "/" + d.getDate();
}

function dayLabel(iso: string): string {
  return DAY_LABELS[new Date(iso + "T00:00:00").getDay()];
}

export function HeartRateDetailScreen() {
  const { theme } = useTheme();
  const ink = theme.ink;
  const card = theme.card;
  const s = useMemo(() => makeStyles(ink, card), [ink, card]);
  const [rangeHours, setRangeHours] = useState(6);
  const [readings, setReadings] = useState<HRReading[]>([]);
  const [loadingChart, setLoadingChart] = useState(true);
  const [dailyRows, setDailyRows] = useState<DayRow[]>([]);
  const [loadingDaily, setLoadingDaily] = useState(true);

  const loadChart = useCallback(async function (hours: number) {
    setLoadingChart(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() - hours * 3600 * 1000);
      const data = await api.heartRateRange(start.toISOString(), now.toISOString());
      setReadings(Array.isArray(data) ? data : []);
    } catch (_) {}
    finally { setLoadingChart(false); }
  }, []);

  useEffect(function () { loadChart(rangeHours); }, [loadChart, rangeHours]);

  useEffect(function () {
    api.heartRateDaily(7)
      .then((rows: DayRow[]) => setDailyRows(Array.isArray(rows) ? rows : []))
      .catch(() => {})
      .finally(() => setLoadingDaily(false));
  }, []);

  // Chart geometry
  const bpms = readings.map((r) => r.bpm);
  const rawMin = bpms.length ? Math.min(...bpms) : 50;
  const rawMax = bpms.length ? Math.max(...bpms) : 120;
  const padding = Math.max(5, Math.round((rawMax - rawMin) * 0.1));
  const chartMin = rawMin - padding;
  const chartMax = rawMax + padding;
  const chartRange = chartMax - chartMin || 1;
  const usableW = CHART_W - PAD_L;
  const usableH = CHART_H - PAD_T - PAD_B;

  const now = Date.now();
  const windowStart = now - rangeHours * 3600 * 1000;
  const windowMs = rangeHours * 3600 * 1000;

  const points = readings
    .map((r) => {
      const t = new Date(r.recorded_at).getTime();
      const x = PAD_L + ((t - windowStart) / windowMs) * usableW;
      const y = PAD_T + usableH - ((r.bpm - chartMin) / chartRange) * usableH;
      return x + "," + y;
    })
    .join(" ");

  const gridVals = (() => {
    const step = chartRange > 80 ? 20 : chartRange > 40 ? 10 : 5;
    const start = Math.ceil(chartMin / step) * step;
    const vals: number[] = [];
    for (let v = start; v <= chartMax; v += step) vals.push(v);
    return vals;
  })();

  const resting = bpms.length ? Math.min(...bpms) : null;
  const peak = bpms.length ? Math.max(...bpms) : null;
  const avg = bpms.length ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null;

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={s.content}>

      {/* Summary stats */}
      <View style={s.card}>
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: theme.red.sub }]}>{resting ?? "--"}</Text>
            <Text style={[s.statLbl, { color: theme.textSoft }]}>Resting</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: theme.textStrong }]}>{avg ?? "--"}</Text>
            <Text style={[s.statLbl, { color: theme.textSoft }]}>Average</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: theme.textStrong }]}>{peak ?? "--"}</Text>
            <Text style={[s.statLbl, { color: theme.textSoft }]}>Peak</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: theme.textStrong }]}>{readings.length || "--"}</Text>
            <Text style={[s.statLbl, { color: theme.textSoft }]}>Readings</Text>
          </View>
        </View>
        <Text style={[s.subNote, { color: theme.textSoft }]}>
          {rangeHours}h window · bpm
        </Text>
      </View>

      {/* Chart */}
      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Heart Rate</Text>
          {peak !== null && (
            <Text style={{ color: theme.red.sub, fontSize: 12 }}>peak {peak} bpm</Text>
          )}
        </View>

        <View style={s.rangeRow}>
          {RANGE_OPTIONS.map((hrs) => (
            <Pressable
              key={hrs}
              onPress={() => setRangeHours(hrs)}
              style={[s.rangeBtn, {
                backgroundColor: rangeHours === hrs ? theme.red.sub : card,
                borderColor: ink,
              }]}
            >
              <Text style={{ color: rangeHours === hrs ? "#fff" : theme.textSoft, fontSize: 12 }}>
                {hrs}h
              </Text>
            </Pressable>
          ))}
        </View>

        {loadingChart ? (
          <LoadingIndicator style={{ marginVertical: 30 }} color={theme.red.sub} />
        ) : readings.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>No heart rate data in this window.</Text>
            <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4 }}>
              Sync from Health Connect on the Health tab.
            </Text>
          </View>
        ) : (
          <Svg width={CHART_W} height={CHART_H} style={{ marginTop: 10 }}>
            {gridVals.map((v) => {
              const gy = PAD_T + usableH - ((v - chartMin) / chartRange) * usableH;
              return (
                <React.Fragment key={v}>
                  <Line x1={PAD_L} x2={CHART_W} y1={gy} y2={gy}
                    stroke={theme.cardBorder} strokeDasharray="2,3" strokeWidth={0.5} />
                  <SvgText x={PAD_L - 4} y={gy + 4} fontSize={9}
                    fill={theme.textSoft} textAnchor="end">{v}</SvgText>
                </React.Fragment>
              );
            })}
            <Polyline points={points} fill="none" stroke={theme.red.sub} strokeWidth={2} />
          </Svg>
        )}
      </View>

      {/* 7-day history */}
      <View style={s.card}>
        <Text style={[s.sectionTitle, { color: theme.textStrong }]}>7-Day History</Text>

        {loadingDaily ? (
          <LoadingIndicator color={theme.red.sub} style={{ marginVertical: 16 }} />
        ) : dailyRows.length === 0 ? (
          <View style={s.emptyBox}>
            <Text style={{ color: theme.textSoft, fontSize: 13 }}>No historical data yet.</Text>
          </View>
        ) : (
          <>
            {/* Column headers */}
            <View style={[s.tableRow, { paddingBottom: 4 }]}>
              <Text style={[s.colDate, { color: theme.textSoft }]}>Date</Text>
              <Text style={[s.colVal, { color: theme.textSoft }]}>Rest</Text>
              <Text style={[s.colVal, { color: theme.textSoft }]}>Avg</Text>
              <Text style={[s.colVal, { color: theme.textSoft }]}>Peak</Text>
              <Text style={[s.colCount, { color: theme.textSoft }]}>Pts</Text>
            </View>

            {dailyRows.map((row, i) => {
              const isToday = row.date === new Date().toISOString().slice(0, 10);
              return (
                <View
                  key={row.date}
                  style={[s.tableRow, { borderTopWidth: 0.5, borderTopColor: theme.cardBorder, paddingVertical: 9 }]}
                >
                  <View style={s.colDate}>
                    <Text style={{ color: isToday ? theme.red.sub : theme.textStrong, fontSize: 13, fontWeight: "500" }}>
                      {dayLabel(row.date)}
                    </Text>
                    <Text style={{ color: theme.textSoft, fontSize: 11 }}>{shortDate(row.date)}</Text>
                  </View>
                  <Text style={[s.colVal, { color: theme.red.sub, fontWeight: "600" }]}>
                    {row.resting_bpm}
                  </Text>
                  <Text style={[s.colVal, { color: theme.textStrong }]}>
                    {row.avg_bpm}
                  </Text>
                  <Text style={[s.colVal, { color: theme.textStrong }]}>
                    {row.peak_bpm}
                  </Text>
                  <Text style={[s.colCount, { color: theme.textSoft }]}>
                    {row.reading_count}
                  </Text>
                </View>
              );
            })}

            <Text style={[s.footNote, { color: theme.textSoft }]}>
              Resting = min bpm · Avg = mean · Peak = max
            </Text>
          </>
        )}
      </View>

    </ScrollView>
  );
}

function makeStyles(ink: string, card: string) {
  const shadow = {
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12 as const,
    shadowRadius: 14,
    elevation: 4,
  };
  return StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  card: { borderRadius: 26, borderWidth: 2, borderColor: ink, padding: 16, backgroundColor: card, ...shadow },
  sectionTitle: { fontSize: 16, fontWeight: "900", letterSpacing: -0.5, marginBottom: 10 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },

  statsRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1 },
  statVal: { fontSize: 20, fontWeight: "900" },
  statLbl: { fontSize: 11, marginTop: 2 },
  subNote: { fontSize: 11, marginTop: 8 },

  rangeRow: { flexDirection: "row", gap: 6, marginBottom: 4 },
  rangeBtn: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },

  emptyBox: { paddingVertical: 24, alignItems: "center" },

  tableRow: { flexDirection: "row", alignItems: "center" },
  colDate: { width: 72 },
  colVal: { flex: 1, textAlign: "right", fontSize: 13 },
  colCount: { width: 36, textAlign: "right", fontSize: 12 },
  footNote: { fontSize: 10, marginTop: 10 },
  });
}
