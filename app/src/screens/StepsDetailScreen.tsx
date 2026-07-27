import React, { useEffect, useState, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useRoute } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { WeekComparisonChart, ChartDayData } from "../components/WeekComparisonChart";

type MonthWeek = {
  week_offset: number;
  week_start_date: string;
  week_label: string;
  is_current: boolean;
  recent_total: number;
  prior_total: number;
  change_pct: number | null;
};

type WeekDay = {
  date: string;
  day_label: string;
  total: number;
  is_today: boolean;
  is_future: boolean;
};

type LastWeekDay = {
  date: string;
  day_label: string;
  total: number;
};

type BreakdownData = {
  this_week: WeekDay[];
  last_week: LastWeekDay[];
  this_week_total: number;
  last_week_total: number;
  this_week_average: number;
  last_week_average: number;
};

const DAY_NAMES: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
  Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

function fmt(n: number): string {
  return n.toLocaleString();
}

function fmtCompact(n: number): string {
  if (n >= 10000) return Math.round(n / 1000) + "k";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

export function StepsDetailScreen() {
  const route = useRoute<any>();
  const { metricId, weekStartDay } = route.params as { metricId: string; weekStartDay: number };
  const { theme } = useTheme();
  const ink = theme.ink;
  const card = theme.card;
  const s = useMemo(() => makeStyles(ink, card), [ink, card]);
  const [data, setData] = useState<BreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthWeek[] | null>(null);

  useEffect(() => {
    api
      .metricDailyBreakdown(metricId, weekStartDay)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    api
      .metricMonthlyBreakdown(metricId, weekStartDay)
      .then(setMonthlyData)
      .catch(() => {});
  }, [metricId, weekStartDay]);

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: theme.page }]}>
        <LoadingIndicator color={theme.teal.bar} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[s.center, { backgroundColor: theme.page }]}>
        <Text style={{ color: theme.textSoft }}>No data available.</Text>
      </View>
    );
  }

  const { this_week, last_week, this_week_total, last_week_total, this_week_average, last_week_average } = data;

  const bestDay = this_week
    .filter((d) => !d.is_future)
    .reduce<WeekDay | null>((best, d) => (!best || d.total > best.total ? d : best), null);

  const wowPct =
    last_week_total > 0
      ? Math.round(((this_week_total - last_week_total) / last_week_total) * 100)
      : null;

  const chartDays: ChartDayData[] = this_week.map((tw, i) => ({
    day_label: tw.day_label,
    this_total: tw.total,
    last_total: last_week[i]?.total ?? 0,
    is_today: tw.is_today,
    is_future: tw.is_future,
  }));

  const avgDiff = this_week_average - last_week_average;

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={s.content}>
      {/* Summary stats */}
      <View style={s.card}>
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: theme.teal.bar }]}>{fmt(this_week_total)}</Text>
            <Text style={[s.statLbl, { color: theme.textSoft }]}>This week</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statVal, { color: theme.textStrong }]}>{fmt(this_week_average)}</Text>
            <Text style={[s.statLbl, { color: theme.textSoft }]}>Daily avg</Text>
          </View>
          {bestDay && bestDay.total > 0 && (
            <View style={s.stat}>
              <Text style={[s.statVal, { color: theme.textStrong }]}>{fmtCompact(bestDay.total)}</Text>
              <Text style={[s.statLbl, { color: theme.textSoft }]}>Best ({bestDay.day_label})</Text>
            </View>
          )}
          {wowPct !== null && (
            <View style={s.stat}>
              <Text style={[s.statVal, { color: wowPct >= 0 ? theme.teal.bar : theme.coral.sub }]}>
                {wowPct >= 0 ? "+" : ""}{wowPct}%
              </Text>
              <Text style={[s.statLbl, { color: theme.textSoft }]}>vs last week</Text>
            </View>
          )}
        </View>
      </View>

      {/* Bar chart */}
      <View style={s.card}>
        <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Week Comparison</Text>
        <WeekComparisonChart
          days={chartDays}
          barColor={theme.teal.bar}
          fadedColor={theme.teal.bg}
          textColor={theme.textSoft}
          formatValue={fmtCompact}
        />
        <View style={s.legend}>
          <View style={s.legendItem}>
            <View style={[s.legendSwatch, { backgroundColor: theme.teal.bar }]} />
            <Text style={[s.legendLbl, { color: theme.textSoft }]}>This week</Text>
          </View>
          <View style={s.legendItem}>
            <View style={[s.legendSwatch, { backgroundColor: theme.teal.bg }]} />
            <Text style={[s.legendLbl, { color: theme.textSoft }]}>Last week</Text>
          </View>
        </View>
      </View>

      {/* Day-by-day list */}
      <View style={s.card}>
        <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Day by Day</Text>
        {this_week.map((tw, i) => {
          const lw = last_week[i];
          const diff = tw.is_future ? null : tw.total - (lw?.total ?? 0);
          const fullDay = DAY_NAMES[tw.day_label] ?? tw.day_label;
          return (
            <View
              key={tw.date}
              style={[s.dayRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: theme.cardBorder }]}
            >
              <Text style={[s.dayName, { color: tw.is_today ? theme.teal.bar : theme.textStrong }]}>
                {fullDay}
              </Text>
              <View style={s.dayCols}>
                <Text style={[s.colThis, { color: tw.is_future ? theme.textSoft : theme.textStrong }]}>
                  {tw.is_future ? "—" : fmt(tw.total)}
                </Text>
                <Text style={[s.colLast, { color: theme.textSoft }]}>
                  {fmt(lw?.total ?? 0)}
                </Text>
                {diff !== null ? (
                  <Text
                    style={[
                      s.colDiff,
                      {
                        color:
                          diff > 0
                            ? theme.teal.bar
                            : diff < 0
                            ? theme.coral.sub
                            : theme.textSoft,
                      },
                    ]}
                  >
                    {diff > 0 ? "↑" : diff < 0 ? "↓" : "="}{fmt(Math.abs(diff))}
                  </Text>
                ) : (
                  <Text style={[s.colDiff, { color: theme.textSoft }]}>—</Text>
                )}
              </View>
            </View>
          );
        })}
        <View style={[s.dayColHeaders, { borderTopWidth: 0.5, borderTopColor: theme.cardBorder }]}>
          <Text style={[s.colHeaderSpacer, { color: theme.textSoft }]} />
          <Text style={[s.colHeaderThis, { color: theme.textSoft }]}>This wk</Text>
          <Text style={[s.colHeaderLast, { color: theme.textSoft }]}>Last wk</Text>
          <Text style={[s.colHeaderDiff, { color: theme.textSoft }]}>Diff</Text>
        </View>
      </View>

      {/* Averages block */}
      <View style={s.card}>
        <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Daily Averages</Text>
        <View style={s.avgsRow}>
          <View style={s.avgCell}>
            <Text style={[s.avgVal, { color: theme.teal.bar }]}>{fmt(this_week_average)}</Text>
            <Text style={[s.avgLbl, { color: theme.textSoft }]}>This week</Text>
          </View>
          <View style={s.avgCell}>
            <Text style={[s.avgVal, { color: theme.textStrong }]}>{fmt(last_week_average)}</Text>
            <Text style={[s.avgLbl, { color: theme.textSoft }]}>Last week</Text>
          </View>
        </View>
        {avgDiff !== 0 && (
          <Text style={[s.avgDiffTxt, { color: avgDiff > 0 ? theme.teal.bar : theme.coral.sub }]}>
            {avgDiff > 0 ? "↑" : "↓"}{fmt(Math.abs(avgDiff))} steps/day vs last week
          </Text>
        )}
      </View>

      {/* Monthly comparison — 4 recent weeks vs same weeks from prior month */}
      {monthlyData && monthlyData.length > 0 && (
        <View style={s.card}>
          <Text style={[s.sectionTitle, { color: theme.textStrong }]}>Month-over-Month</Text>
          <View style={s.monthColHeaders}>
            <Text style={[s.monthColWeek, { color: theme.textSoft }]}>Week of</Text>
            <Text style={[s.monthColVal, { color: theme.textSoft }]}>Recent</Text>
            <Text style={[s.monthColVal, { color: theme.textSoft }]}>Prior</Text>
            <Text style={[s.monthColChg, { color: theme.textSoft }]}>Change</Text>
          </View>
          {monthlyData.map((w, i) => (
            <View
              key={w.week_start_date}
              style={[s.monthRow, i > 0 && { borderTopWidth: 0.5, borderTopColor: theme.cardBorder }]}
            >
              <Text style={[s.monthColWeek, { color: w.is_current ? theme.teal.bar : theme.textStrong }]}>
                {w.week_label}{w.is_current ? " ·" : ""}
              </Text>
              <Text style={[s.monthColVal, { color: w.is_current ? theme.teal.bar : theme.textStrong }]}>
                {fmtCompact(w.recent_total)}
              </Text>
              <Text style={[s.monthColVal, { color: theme.textSoft }]}>
                {fmtCompact(w.prior_total)}
              </Text>
              {w.change_pct !== null ? (
                <Text style={[s.monthColChg, { color: w.change_pct >= 0 ? theme.teal.bar : theme.coral.sub }]}>
                  {w.change_pct >= 0 ? "+" : ""}{w.change_pct}%
                </Text>
              ) : (
                <Text style={[s.monthColChg, { color: theme.textSoft }]}>—</Text>
              )}
            </View>
          ))}
          <Text style={[s.monthNote, { color: theme.textSoft }]}>
            Compared to same weeks 4 weeks ago
          </Text>
        </View>
      )}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 26, borderWidth: 2, borderColor: ink, padding: 16, backgroundColor: card, ...shadow },
  sectionTitle: { fontSize: 16, fontWeight: "900", letterSpacing: -0.5, marginBottom: 12 },

  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  stat: { flex: 1, minWidth: 70 },
  statVal: { fontSize: 18, fontWeight: "800" },
  statLbl: { fontSize: 11, marginTop: 2 },

  legend: { flexDirection: "row", gap: 16, marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendLbl: { fontSize: 11 },

  dayRow: { paddingVertical: 10, flexDirection: "row", alignItems: "center" },
  dayName: { fontSize: 13, fontWeight: "600", width: 82 },
  dayCols: { flex: 1, flexDirection: "row", alignItems: "center" },
  colThis: { flex: 1, fontSize: 13, fontWeight: "600", textAlign: "right" },
  colLast: { flex: 1, fontSize: 12, textAlign: "right" },
  colDiff: { flex: 1, fontSize: 12, textAlign: "right" },
  dayColHeaders: { flexDirection: "row", paddingTop: 6, marginTop: 2 },
  colHeaderSpacer: { width: 82 },
  colHeaderThis: { flex: 1, fontSize: 10, textAlign: "right" },
  colHeaderLast: { flex: 1, fontSize: 10, textAlign: "right" },
  colHeaderDiff: { flex: 1, fontSize: 10, textAlign: "right" },

  avgsRow: { flexDirection: "row", gap: 24 },
  avgCell: { flex: 1 },
  avgVal: { fontSize: 22, fontWeight: "900" },
  avgLbl: { fontSize: 11, marginTop: 2 },
  avgDiffTxt: { fontSize: 12, marginTop: 12 },

  monthColHeaders: { flexDirection: "row", paddingBottom: 6, marginBottom: 2 },
  monthRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9 },
  monthColWeek: { flex: 2, fontSize: 12 },
  monthColVal: { flex: 1, fontSize: 13, fontWeight: "600", textAlign: "right" },
  monthColChg: { flex: 1, fontSize: 12, textAlign: "right" },
  monthNote: { fontSize: 10, marginTop: 8 },
  });
}
