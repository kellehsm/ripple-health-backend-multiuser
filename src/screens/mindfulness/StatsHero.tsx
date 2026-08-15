import React, { useCallback, useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { ShadowCard } from "../../components/ShadowCard";
import { api } from "../../api/client";

export type MindfulnessBackendStats = {
  streak: number;
  practiced_today: boolean;
  week_sessions: number;
  week_minutes: number;
  total_sessions: number;
  total_minutes: number;
  avg_mood_delta: number | null;
  mood_delta_sessions: number;
  days: { day: string; sessions: number; minutes: number }[];
  by_type: Record<string, number>;
};

const MILESTONES = [
  { at: 1,   emoji: "🌱", label: "First session" },
  { at: 5,   emoji: "🌿", label: "5 sessions" },
  { at: 10,  emoji: "🌊", label: "10 sessions" },
  { at: 20,  emoji: "🧘", label: "20 sessions" },
  { at: 50,  emoji: "⭐", label: "50 sessions" },
  { at: 100, emoji: "🏆", label: "100 sessions" },
];

function localDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function Heatmap({ days, accent, theme }: {
  days: { day: string; minutes: number; sessions: number }[];
  accent: string;
  theme: any;
}) {
  const byDay = new Map<string, number>();
  for (const d of days) byDay.set(d.day.slice(0, 10), d.sessions);

  // 12 weeks × 7 days, ending today; columns = weeks, rows = weekdays
  const today = new Date();
  const cells: { key: string; sessions: number; future: boolean }[][] = [];
  const start = new Date(today);
  start.setDate(start.getDate() - 83);
  // Align first column to start on the weekday of `start`
  for (let w = 0; w < 12; w++) {
    const col: { key: string; sessions: number; future: boolean }[] = [];
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7 + d);
      const key = localDayString(cur);
      col.push({ key, sessions: byDay.get(key) ?? 0, future: cur > today });
    }
    cells.push(col);
  }

  return (
    <View style={{ flexDirection: "row", gap: 3, justifyContent: "center" }}>
      {cells.map((col, i) => (
        <View key={i} style={{ gap: 3 }}>
          {col.map((c) => (
            <View
              key={c.key}
              style={{
                width: 10, height: 10, borderRadius: 3,
                backgroundColor: c.future
                  ? "transparent"
                  : c.sessions >= 3 ? accent
                  : c.sessions === 2 ? accent + "B3"
                  : c.sessions === 1 ? accent + "66"
                  : (theme.cardBorder ?? "rgba(150,150,150,0.25)"),
                opacity: c.future ? 0 : c.sessions > 0 ? 1 : 0.35,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function StatsHero({ theme, ink, refreshKey }: { theme: any; ink: string; refreshKey?: number }) {
  const [stats, setStats] = useState<MindfulnessBackendStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api.mindfulnessStats()
        .then((s: MindfulnessBackendStats) => { if (!cancelled) setStats(s); })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [refreshKey])
  );

  const teal = (theme.teal as any) ?? {};
  const accent = teal.solid ?? ink;

  if (!stats || stats.total_sessions === 0) {
    return (
      <ShadowCard size="card" bg={theme.card} accent={accent} rotate={-0.3}>
        <View style={{ alignItems: "center", paddingVertical: 8 }}>
          <Text style={{ fontSize: 24, marginBottom: 4 }}>🧘</Text>
          <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "800" }}>Your stats will grow here</Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4, textAlign: "center" }}>
            Complete your first session to start a streak.
          </Text>
        </View>
      </ShadowCard>
    );
  }
  const earned = MILESTONES.filter((m) => stats.total_sessions >= m.at);
  const lift = stats.avg_mood_delta;

  return (
    <ShadowCard size="card" bg={theme.card} accent={accent} rotate={-0.3}>
      <View style={{ flex: 1, gap: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          <View style={{ alignItems: "center" }}>
            <Ionicons name="flame" size={22} color={accent} />
            <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>{stats.streak}</Text>
            <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>DAY STREAK</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Ionicons name="timer-outline" size={22} color={accent} />
            <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>{stats.week_minutes}</Text>
            <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>MIN THIS WEEK</Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Ionicons name="flower-outline" size={22} color={accent} />
            <Text style={{ color: theme.textStrong, fontSize: 20, fontWeight: "900" }}>{stats.total_sessions}</Text>
            <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>SESSIONS</Text>
          </View>
        </View>

        {lift !== null && stats.mood_delta_sessions >= 3 && lift > 0 && (
          <Text style={{ color: teal.fg ?? theme.textStrong, fontSize: 12, textAlign: "center", fontWeight: "600" }}>
        ✨ Your mood rises about {lift % 1 === 0 ? lift : lift.toFixed(1)} point{lift >= 1.5 ? "s" : ""} after a session ({stats.mood_delta_sessions} sessions measured)
          </Text>
        )}

        <Heatmap days={stats.days ?? []} accent={accent} theme={theme} />
        <Text style={{ color: theme.textSoft, fontSize: 10, textAlign: "center", letterSpacing: 0.4 }}>
          LAST 12 WEEKS
        </Text>

        {earned.length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {earned.map((m) => (
              <View key={m.at} style={{
                flexDirection: "row", alignItems: "center", gap: 4,
                borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
                backgroundColor: accent + "1E", borderWidth: 1, borderColor: accent + "55",
              }}>
                <Text style={{ fontSize: 12 }}>{m.emoji}</Text>
                <Text style={{ color: theme.textStrong, fontSize: 10, fontWeight: "800" }}>{m.label}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ShadowCard>
  );
}
