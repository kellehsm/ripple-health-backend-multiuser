import React, { useCallback, useEffect, useRef, useState } from "react";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import { ScreenBackground } from "../components/ScreenBackground";
import {
  Animated, Easing, ScrollView, View, Text, StyleSheet, RefreshControl, Pressable
} from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { InsightCard, Insight } from "../components/InsightCard";
import { UndoBanner } from "../components/UndoBanner";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { getCached, setCached, invalidateCache } from "../utils/staleCache";

function SkeletonPulse({ style }: { style?: object }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.85, duration: 750, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.4, duration: 750, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);
  return <Animated.View style={[{ backgroundColor: "#C8C8C8", borderRadius: 14 }, style, { opacity }]} />;
}

function SkeletonCard() {
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: 26, borderWidth: 2, borderColor: "#E0E0E0", backgroundColor: "#F5F5F5" }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <SkeletonPulse style={{ width: 30, height: 30, borderRadius: 12 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonPulse style={{ height: 14, width: "70%" }} />
          <SkeletonPulse style={{ height: 10, width: "40%" }} />
        </View>
      </View>
      <SkeletonPulse style={{ height: 13, width: "95%" }} />
      <SkeletonPulse style={{ height: 13, width: "80%" }} />
    </View>
  );
}

function AnimatedCard({
  insight,
  onDismiss,
  onSnooze,
  animValue,
}: {
  insight: Insight;
  onDismiss?: (id: string) => void;
  onSnooze?: (id: string, days: number) => void;
  animValue: Animated.Value;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = animValue.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const translateY = animValue.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <InsightCard
        insight={insight}
        onDismiss={onDismiss}
        onSnooze={onSnooze}
        onPressIn={() => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 300, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 300, bounciness: 4 }).start()}
      />
    </Animated.View>
  );
}

const TYPE_GROUPS: { label: string; types: string[]; emoji: string }[] = [
  { label: "All",          types: [],                                              emoji: "✨" },
  { label: "Wellness",     types: ["glucose", "sleep", "activity", "water", "steps"], emoji: "❤️" },
  { label: "Mindfulness",  types: ["mood"],                                        emoji: "🧠" },
  { label: "Hobbies",      types: ["hobbies", "books"],                            emoji: "🎨" },
  { label: "Medication",   types: ["medication"],                                  emoji: "💊" },
  { label: "Exercise",     types: ["exercise"],                                    emoji: "🏋️" },
  { label: "Finance",      types: ["spending", "streak"],                          emoji: "💰" },
  { label: "Cycle",        types: ["cycle"],                                       emoji: "🌸" },
  { label: "Combined",     types: ["combined"],                                    emoji: "🔗" },
];

export function InsightsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const insightsIntro = findIntro("insights")!;
  const [introVisible, dismissIntro] = useFeatureIntro(insightsIntro.key);
  const ink = theme.ink;
  const card = theme.card;

  const [showTooltip, setShowTooltip] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dismissed, setDismissed] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);
  const [showDismissed, setShowDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoItem, setUndoItem] = useState<Insight | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const isFirstLoad = useRef(true);
  const loadCancelledRef = useRef(false);
  // Per-card animation values for stagger entrance
  const cardAnims = useRef<Animated.Value[]>([]);
  const staggerRef = useRef<Animated.CompositeAnimation | null>(null);

  async function load(showRefresh = false) {
    if (!showRefresh) {
      const cached = getCached<{ active: Insight[]; dismissed: Insight[] }>('insights:list');
      if (cached) {
        setInsights(cached.active);
        setDismissed(cached.dismissed);
        setAnimationKey(k => k + 1);
        isFirstLoad.current = false;
        setLoading(false);
        return;
      }
    }
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [active, history] = await Promise.all([api.getInsights(), api.getInsightHistory()]);
      if (loadCancelledRef.current) return;
      const activeList: Insight[] = Array.isArray(active) ? active : [];
      const activeIds = new Set(activeList.map((i: Insight) => i.id));
      const dismissedList: Insight[] = Array.isArray(history)
        ? history.filter((i: any) => i.dismissed && !activeIds.has(i.id))
        : [];
      setCached('insights:list', { active: activeList, dismissed: dismissedList });
      setInsights(activeList);
      setDismissed(dismissedList);
      setAnimationKey(k => k + 1);
      isFirstLoad.current = false;
    } catch (e: any) {
      if (!loadCancelledRef.current) setError("Couldn't load insights — pull to retry.");
    } finally {
      if (!loadCancelledRef.current) { setLoading(false); setRefreshing(false); }
    }
  }

  useFocusEffect(useCallback(() => {
    loadCancelledRef.current = false;
    hasSeenTooltip("insights").then(seen => {
      if (!loadCancelledRef.current && !seen) {
        setShowTooltip(true);
        markTooltipSeen("insights");
      }
    });
    load();
    return () => { loadCancelledRef.current = true; };
  }, []));

  async function handleSnooze(id: string, days: number) {
    // Optimistic: same UX as dismiss — the card leaves the active list and
    // the undo-timeout banner surfaces so the user can revert.
    try {
      await api.snoozeInsight(id, days);
      const item = insights.find(i => i.id === id);
      setInsights(prev => prev.filter(i => i.id !== id));
      if (item) {
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        setUndoItem(item);
        undoTimerRef.current = setTimeout(() => setUndoItem(null), 3500);
      }
    } catch (_) {}
  }

  async function handleDismiss(id: string) {
    try {
      await api.dismissInsight(id);
      const item = insights.find(i => i.id === id);
      setInsights(prev => prev.filter(i => i.id !== id));
      if (item) {
        setDismissed(prev => [{ ...item, dismissed: true }, ...prev]);
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        setUndoItem(item);
        undoTimerRef.current = setTimeout(() => setUndoItem(null), 3500);
      }
    } catch (_) {}
  }

  async function handleUndoDismiss() {
    if (!undoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const item = undoItem;
    setUndoItem(null);
    await handleUndismiss(item.id);
  }

  async function handleUndismiss(id: string) {
    try {
      await api.undismissInsight(id);
      const item = dismissed.find(i => i.id === id);
      setDismissed(prev => prev.filter(i => i.id !== id));
      if (item) setInsights(prev => [{ ...item, dismissed: false }, ...prev]);
    } catch (_) {}
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await api.regenerateInsights();
      invalidateCache('insights:list');
      await load(true);
    } catch (_) {}
    setRegenerating(false);
  }

  const group = TYPE_GROUPS[activeGroup];
  const filtered = group.types.length === 0
    ? insights
    : insights.filter(i => group.types.includes(i.type));

  const streaks   = filtered.filter(i => i.type === "streak");
  const patterns  = filtered.filter(i => i.type !== "streak");

  // Rebuild and fire stagger animation whenever filtered list or active group changes
  useEffect(() => {
    if (loading) return;
    const count = filtered.length;
    // Reset to correct length
    cardAnims.current = Array.from({ length: count }, () => new Animated.Value(0));
    if (staggerRef.current) staggerRef.current.stop();
    if (count === 0) return;
    const animations = cardAnims.current.map((val) =>
      Animated.parallel([
        Animated.timing(val, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    staggerRef.current = Animated.stagger(60, animations);
    staggerRef.current.start();
  }, [animationKey, activeGroup, loading]);

  const styles = makeStyles(theme.page, ink, card);

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
    <ScreenBackground pageId="insights" />
    <ScrollView
      style={{ flex: 1, backgroundColor: "transparent" }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.primary} colors={[theme.primary]} />}
    >
      {showTooltip && (
        <TooltipBubble
          message="Long-term patterns detected from your data, updated nightly. Each insight shows a confidence level based on how strong the pattern is. Dismiss ones that don't apply to you."
          onDismiss={() => setShowTooltip(false)}
        />
      )}
      {/* Header */}
      <View style={styles.headerBlock}>
        <Text style={[styles.heading, { color: theme.textStrong }]}>Your Insights</Text>
        <Text style={[styles.subheading, { color: theme.textSoft }]}>
          Patterns observed in your own data — not medical advice.
        </Text>
        <Pressable
          onPress={handleRegenerate}
          style={[styles.regenBtn, { borderColor: ink, opacity: regenerating ? 0.5 : 1 }]}
          disabled={regenerating}
        >
          {regenerating
            ? <LoadingIndicator size="small" color={theme.textSoft} />
            : <><Ionicons name="refresh" size={13} color={theme.textSoft} /><Text style={[styles.regenText, { color: theme.textSoft }]}>  Refresh analysis</Text></>
          }
        </Pressable>
      </View>

      {/* Filter grid — 3 rows of 3 */}
      {loading && isFirstLoad.current ? (
        <View style={{ gap: 6, marginBottom: 12 }}>
          {[0, 1, 2].map((rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: "row", gap: 6 }}>
              {[0, 1, 2].map((colIdx) => (
                <View key={colIdx} style={{ flex: 1, height: 32, borderRadius: 20, backgroundColor: theme.cardBorder }} />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ gap: 6, marginBottom: 12 }}>
          {[TYPE_GROUPS.slice(0, 3), TYPE_GROUPS.slice(3, 6), TYPE_GROUPS.slice(6)].map((row, rowIdx) => (
            <View key={rowIdx} style={{ flexDirection: "row", gap: 6 }}>
              {row.map((g) => {
                const idx = TYPE_GROUPS.indexOf(g);
                const active = activeGroup === idx;
                return (
                  <Pressable
                    key={g.label}
                    onPress={() => { Haptics.selectionAsync(); setActiveGroup(idx); }}
                    style={[
                      styles.filterTab,
                      { flex: 1, borderColor: ink, backgroundColor: active ? ink : "transparent" },
                    ]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={styles.filterEmoji}>{g.emoji}</Text>
                      <Text style={[styles.filterText, { color: active ? theme.page : theme.textSoft }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{g.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      )}

      {loading && (
        <View style={{ gap: 10 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      )}

      {!loading && error && (
        <Text style={[styles.emptyText, { color: theme.coral.solid }]}>{error}</Text>
      )}

      {!loading && !error && insights.length === 0 && (
        <View style={[styles.emptyCard, { backgroundColor: card, borderColor: ink }]}>
          <Text style={{ fontSize: 32, marginBottom: 12 }}>🌱</Text>
          <Text style={[styles.emptyTitle, { color: theme.textStrong }]}>Building your profile</Text>
          <Text style={[styles.emptyText, { color: theme.textSoft }]}>
            Keep logging meals, mood, and activity. Patterns start appearing after 2–3 weeks of data.
          </Text>
        </View>
      )}

      {!loading && !error && filtered.length === 0 && insights.length > 0 && (
        <View style={{ alignItems: "center", paddingVertical: 48, gap: 12 }}>
          <Text style={{ fontSize: 32 }}>✨</Text>
          <Text style={{ fontSize: 16, fontWeight: "600", color: theme.textStrong }}>No insights yet</Text>
          <Text style={{ fontSize: 13, color: theme.textSoft, textAlign: "center", paddingHorizontal: 32 }}>
            Log a few days of meals, glucose, and mood and your first insights will appear here.
          </Text>
        </View>
      )}

      {/* Streak badges */}
      {streaks.length > 0 && (
        <View style={{ marginBottom: 4 }}>
          <Text style={[styles.sectionLabel, { color: theme.textSoft }]}>STREAKS</Text>
          <View style={{ gap: 10 }}>
            {streaks.map((insight, i) => (
              <AnimatedCard
                key={`${animationKey}-${insight.id}`}
                insight={insight}
                onDismiss={handleDismiss}
                onSnooze={handleSnooze}
                animValue={cardAnims.current[i] ?? new Animated.Value(1)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Pattern insights */}
      {patterns.length > 0 && (
        <View>
          {streaks.length > 0 && (
            <Text style={[styles.sectionLabel, { color: theme.textSoft, marginTop: 8 }]}>PATTERNS</Text>
          )}
          <View style={{ gap: 10 }}>
            {patterns.map((insight, i) => (
              <AnimatedCard
                key={`${animationKey}-${insight.id}`}
                insight={insight}
                onDismiss={handleDismiss}
                onSnooze={handleSnooze}
                animValue={cardAnims.current[streaks.length + i] ?? new Animated.Value(1)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Dismissed section */}
      {dismissed.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Pressable
            onPress={() => setShowDismissed(v => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
          >
            <Ionicons name={showDismissed ? "chevron-down" : "chevron-forward"} size={14} color={theme.textSoft} />
            <Text style={[styles.sectionLabel, { color: theme.textSoft, marginBottom: 0 }]}>
              DISMISSED ({dismissed.length})
            </Text>
          </Pressable>
          {showDismissed && (
            <View style={{ gap: 8, marginTop: 6 }}>
              {dismissed.map(insight => (
                <View key={insight.id} style={[styles.dismissedRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                  <Text style={{ color: theme.textSoft, fontSize: 13, flex: 1, lineHeight: 18 }}>{insight.title}</Text>
                  <Pressable
                    onPress={() => handleUndismiss(insight.id)}
                    hitSlop={8}
                    style={[styles.restoreBtn, { borderColor: theme.ink }]}
                    accessibilityLabel="Restore insight"
                  >
                    <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "700" }}>RESTORE</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <Pressable
        onPress={() => navigation.navigate("InsightsHistory")}
        style={({ pressed }) => [
          {
            marginTop: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: 1.5,
            borderRadius: 14,
            borderColor: theme.cardBorder,
            backgroundColor: theme.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="View past insights"
      >
        <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: 13 }}>
          View past insights
        </Text>
        <Text style={{ color: theme.textSoft, fontSize: 16 }}>›</Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate("Chat")}
        style={({ pressed }) => [
          {
            marginTop: 10,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: 1.5,
            borderRadius: 14,
            borderColor: theme.cardBorder,
            backgroundColor: theme.card,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Ask about your data"
      >
        <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: 13 }}>
          Ask about your data
        </Text>
        <Text style={{ color: theme.textSoft, fontSize: 16 }}>›</Text>
      </Pressable>

      <Text style={[styles.footer, { color: theme.textSoft }]}>
        Insights are based on statistical patterns in your personal data only. They describe observations, never diagnoses. Always consult a healthcare professional for medical decisions.
      </Text>
    </ScrollView>
    {undoItem && (
      <UndoBanner
        message={`Dismissed: ${undoItem.title.slice(0, 50)}${undoItem.title.length > 50 ? '…' : ''}`}
        onUndo={handleUndoDismiss}
        theme={theme}
      />
    )}
    <FeatureIntroSheet intro={insightsIntro} visible={introVisible} onClose={dismissIntro} />
    </View>
  );
}

function makeStyles(page: string, ink: string, card: string) {
  return StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 32 },
    headerBlock: { gap: 4, marginBottom: 4 },
    heading: { fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
    subheading: { fontSize: 13, lineHeight: 18 },
    regenBtn: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      marginTop: 8,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    regenText: { fontSize: 12, fontWeight: "600" },
    filterTab: {
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterEmoji: { fontSize: 14 },
    filterText: { fontSize: 11, fontWeight: "700" },
    sectionLabel: {
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.6,
      marginBottom: 6,
      textTransform: "uppercase",
    },
    emptyCard: {
      borderRadius: 22,
      borderWidth: 2,
      padding: 24,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 3,
    },
    emptyTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
    emptyText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
    dismissedRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      borderRadius: 22,
      borderWidth: 1,
    },
    restoreBtn: {
      borderWidth: 1.5,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    footer: {
      fontSize: 11,
      lineHeight: 16,
      fontStyle: "italic",
      textAlign: "center",
      marginTop: 8,
      paddingHorizontal: 8,
    },
  });
}
