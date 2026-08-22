import React, { useCallback, useState } from "react";
import { FlatList, View, Text, StyleSheet, RefreshControl } from "react-native";
import { ScreenBackground } from "../components/ScreenBackground";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "../components/ShadowCard";
import { EmptyState } from "../components/EmptyState";
import { LoadingMessage } from "../components/LoadingMessage";
import { api } from "../api/client";
import { adaptiveInsight, Confidence } from "../lib/softenInsight";
import { fmtDate } from "../utils/dateUtils";

type Insight = {
  id: string;
  title: string;
  description: string;
  confidence: string;
  status: string;
  dismissed: boolean;
  first_detected: string;
  last_confirmed: string;
  times_observed: number;
};

type TimelineEvent = {
  id: string;
  type: string;
  title: string;
  description?: string;
  occurred_at: string;
  [key: string]: any;
};

export function InsightsHistoryScreen() {
  const { theme } = useTheme();
  const [items, setItems] = useState<Insight[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!refreshing) setLoading(true);
      setLoadError(false);
      Promise.all([
        api.getInsightHistory(),
        api.insightTimeline().catch(() => null),
      ])
        .then(([rows, tl]: any[]) => {
          if (cancelled) return;
          const list: Insight[] = Array.isArray(rows) ? rows : [];
          list.sort((a, b) => new Date(b.last_confirmed).getTime() - new Date(a.last_confirmed).getTime());
          setItems(list);
          const tlList: TimelineEvent[] = Array.isArray(tl) ? tl : Array.isArray(tl?.events) ? tl.events : [];
          tlList.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
          setTimeline(tlList);
        })
        .catch(() => { if (!cancelled) setLoadError(true); })
        .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false); } });
      return () => { cancelled = true; };
    }, [reloadKey])
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, justifyContent: "center" }}>
        <LoadingMessage kind="insights" />
      </View>
    );
  }

  if (loadError && items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, padding: 16 }}>
        <EmptyState
          icon="⚠️"
          title="Couldn't load past insights"
          subtitle="Check your connection and try again."
          action={{ label: "Retry", onPress: () => setReloadKey((k) => k + 1) }}
        />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, padding: 16 }}>
        <EmptyState
          icon="💡"
          title="No past insights yet"
          subtitle="As Ripple watches your patterns, older observations will collect here."
        />
      </View>
    );
  }

  const renderItem = useCallback(({ item: i }: { item: Insight }) => {
    const isActive = i.status === "active" && !i.dismissed;
    const softened = adaptiveInsight(i.description, (i.confidence as Confidence) ?? "moderate");
    return (
      <ShadowCard size="card" bg={theme.card} accent={isActive ? theme.teal.solid : theme.cardBorder}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {!isActive && (
              <View style={[styles.tag, { borderColor: theme.cardBorder }]}>
                <Text style={{ color: theme.textSoft, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 }}>
                  {i.dismissed ? "DISMISSED" : "PAST"}
                </Text>
              </View>
            )}
            <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "800", flex: 1 }}>{i.title}</Text>
          </View>
          <Text style={{ color: theme.textStrong, fontSize: 13, lineHeight: 19 }}>{softened}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <Ionicons name="calendar-outline" size={11} color={theme.textSoft} />
              <Text style={{ color: theme.textSoft, fontSize: 11 }}>
                {fmtDate(i.last_confirmed.slice(0, 10))}
              </Text>
            </View>
            {i.times_observed > 1 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <Ionicons name="repeat" size={11} color={theme.textSoft} />
                <Text style={{ color: theme.textSoft, fontSize: 11 }}>seen {i.times_observed}×</Text>
              </View>
            )}
          </View>
        </View>
      </ShadowCard>
    );
  }, [theme]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="insights_history" />
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 80 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); setReloadKey((k) => k + 1); }}
          tintColor={theme.teal.solid}
          colors={[theme.teal.solid]}
        />
      }
      data={items}
      keyExtractor={(i) => i.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <Text style={[styles.intro, { color: theme.textSoft }]}>
          Everything Ripple has noticed about your patterns — active and past, most recent first.
        </Text>
      }
      ListFooterComponent={
        timeline.length > 0 ? (
          <View style={{ marginTop: 20, gap: 8 }}>
            <Text style={[styles.sectionHeader, { color: theme.textSoft }]}>TIMELINE</Text>
            {timeline.map((ev) => (
              <View
                key={ev.id ?? ev.occurred_at}
                style={{ backgroundColor: theme.card, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: theme.cardBorder }}
              >
                <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "800", marginBottom: 2 }}>{ev.title ?? ev.type}</Text>
                {!!ev.description && (
                  <Text style={{ color: theme.textSoft, fontSize: 12, lineHeight: 17 }}>{ev.description}</Text>
                )}
                <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 4 }}>
                  {fmtDate(ev.occurred_at.slice(0, 10))}
                </Text>
              </View>
            ))}
          </View>
        ) : null
      }
    />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
  tag: { borderWidth: 1.5, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  sectionHeader: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: 2 },
});
