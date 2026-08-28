/**
 * overview/HeaderCard.tsx
 * The sticky header block: greeting, date, streak pills, weekly activity summary,
 * motivational message, and the edit-layout button.
 * Streak pill animations (stagger-fade, scale-bounce, counter) are owned here.
 * Extracted from OverviewScreen.tsx — no logic changes.
 */
import React, { useRef, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, Animated, StyleSheet, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { onSolid } from "../../theme/colorUtils";
import { ThemedIcon } from "../../theme/iconRegistry";
import { ConfettiBurst } from "../../components/ConfettiBurst";
import { scoreColor } from "../../components/DailySummaryCard";
import { AnimatedCounterText, streakMotivationMessage, getGreeting } from "./shared";
import { FONT_SIZES } from "../../theme/tokens";

type StreakEntry = { label: string; slot: string; count: number; color: (t: any) => string };

interface Props {
  allStreaks: StreakEntry[];
  weeklyData: Array<{ date: string; avg_mood: number | null; sleep_hours: number; total_spent: number }>;
  loading: boolean;
  dailySummary: { scores?: { overall?: number | null } | null } | null;
  userName: string | null;
  greetingOpacity: Animated.Value;
  tourHeaderRef: React.RefObject<View | null>;
  navigation: any;
  onEditLayout: () => void;
  freezeStatus?: { available: boolean; used_this_month: boolean; freeze_count_remaining: number } | null;
  onFreezeStreak?: () => void;
  adaptiveGreeting?: string | null;
}

export function HeaderCard({
  allStreaks,
  weeklyData,
  loading,
  dailySummary,
  userName,
  greetingOpacity,
  tourHeaderRef,
  navigation,
  onEditLayout,
  freezeStatus,
  onFreezeStreak,
  adaptiveGreeting,
}: Props) {
  const { theme } = useTheme();

  // Streak pill animations — owned locally since they are section-local
  const streakAnim = useRef<Animated.Value[]>([]);
  const streakScaleAnims = useRef<Animated.Value[]>([]);
  const streakCounterAnims = useRef<Animated.Value[]>([]);
  const prevStreaksRef = useRef<StreakEntry[]>([]);
  const [confettiKeys, setConfettiKeys] = useState<Record<string, number>>({});

  // Streak pills stagger-fade whenever allStreaks changes
  useEffect(function () {
    if (allStreaks.length === 0) return;
    if (streakAnim.current.length !== allStreaks.length) {
      streakAnim.current = allStreaks.map(() => new Animated.Value(0));
    } else {
      streakAnim.current.forEach(v => v.setValue(0));
    }
    Animated.stagger(
      60,
      streakAnim.current.map(v =>
        Animated.timing(v, { toValue: 1, duration: 280, useNativeDriver: true })
      )
    ).start();
  }, [allStreaks]);

  // Streak scale-bounce — fire when a streak count increases
  useEffect(function () {
    if (allStreaks.length === 0) return;
    if (streakScaleAnims.current.length !== allStreaks.length) {
      streakScaleAnims.current = allStreaks.map(() => new Animated.Value(1));
    }
    const prev = prevStreaksRef.current;
    allStreaks.forEach((s, i) => {
      const prevEntry = prev.find(p => p.label === s.label);
      if (prevEntry && s.count > prevEntry.count) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setConfettiKeys(k => ({ ...k, [s.label]: (k[s.label] ?? 0) + 1 }));
        const scaleAnim = streakScaleAnims.current[i];
        if (scaleAnim) {
          scaleAnim.setValue(1);
          Animated.sequence([
            Animated.spring(scaleAnim, { toValue: 1.2, useNativeDriver: true, damping: 6, stiffness: 400 }),
            Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 10, stiffness: 300 }),
          ]).start();
        }
      }
    });
    prevStreaksRef.current = allStreaks;
  }, [allStreaks]);

  // Streak counter anims — rebuild when allStreaks changes
  useEffect(function () {
    if (allStreaks.length === 0) return;
    if (streakCounterAnims.current.length !== allStreaks.length) {
      streakCounterAnims.current = allStreaks.map(() => new Animated.Value(0));
    } else {
      streakCounterAnims.current.forEach(v => v.setValue(0));
    }
    Animated.stagger(
      80,
      streakCounterAnims.current.map(v =>
        Animated.timing(v, { toValue: 1, duration: 600, useNativeDriver: false })
      )
    ).start();
  }, [allStreaks]);

  const overall = dailySummary?.scores?.overall ?? null;
  const topStreak = allStreaks.reduce((m, s) => Math.max(m, s.count), 0);

  return (
    <View ref={tourHeaderRef} style={styles.headerBlock}>
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Animated.View style={{ opacity: greetingOpacity }}>
            {(function () {
              const g = getGreeting();
              const hasImgOverride = !!(theme as any).iconOverrides?.[g.emojiSlot];
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: hasImgOverride ? 10 : 6 }}>
                  <Text style={[styles.greeting, { color: theme.textStrong }]} accessibilityRole="header">
                    {g.text}{userName ? `, ${userName}` : ""}
                  </Text>
                  <ThemedIcon slot={g.emojiSlot} size={hasImgOverride ? 128 : 24} />
                </View>
              );
            })()}
          </Animated.View>
          <Text style={[styles.dateText, { color: theme.textSoft }]}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          {adaptiveGreeting ? (
            <Text style={{ fontSize: FONT_SIZES.label, fontWeight: "700", color: theme.teal.solid, marginBottom: 2 }}>
              {adaptiveGreeting}
            </Text>
          ) : null}
          {(overall !== null || topStreak >= 2) && (() => {
            const parts: string[] = [];
            if (overall !== null) parts.push(`Score ${overall}`);
            if (topStreak >= 2) parts.push(`${topStreak}-day streak 🔥`);
            return (
              <Text style={{ fontSize: FONT_SIZES.label, fontWeight: "700", color: scoreColor(overall, theme), marginTop: 2 }}>
                {parts.join(" · ")}
              </Text>
            );
          })()}
        </View>
        <Pressable
          onPress={onEditLayout}
          hitSlop={14}
          style={{ marginTop: 2 }}
          accessibilityLabel="Edit dashboard layout"
          accessibilityRole="button"
        >
          <Ionicons name="pencil-outline" size={19} color={theme.textSoft} />
        </Pressable>
      </View>

      {allStreaks.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          <View style={{ flexDirection: "row", gap: 6, paddingRight: 4 }}>
            {allStreaks.map((s, index) => {
              const animVal = streakAnim.current[index] ?? new Animated.Value(1);
              const counterAnim = streakCounterAnims.current[index];
              const scaleAnim = streakScaleAnims.current[index] ?? new Animated.Value(1);
              const isFreeze = s.count > 0 && s.count % 7 === 0;
              return (
                <Animated.View
                  key={s.label}
                  style={{
                    opacity: animVal,
                    transform: [
                      { translateY: animVal.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
                      { scale: scaleAnim },
                    ],
                  }}
                >
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (s.label === "Meals") navigation.getParent()?.navigate("Meals");
                      else if (s.label === "Steps") navigation.getParent()?.navigate("StepsDetail");
                      else if (s.label === "Exercise") navigation.getParent()?.navigate("Exercise");
                      else if (s.label === "Reading") navigation.getParent()?.navigate("Life");
                    }}
                    style={[
                      styles.streakPill,
                      { backgroundColor: isFreeze ? theme.blue.tint : s.color(theme) },
                      s.count >= 30
                        ? { borderWidth: 2, borderColor: theme.amber.solid }
                        : s.count >= 7
                        ? { borderWidth: 1.5, borderColor: theme.amber.sub }
                        : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.count} day ${s.label} streak`}
                  >
                    <ThemedIcon slot={s.slot} size={11} style={{ marginRight: 4 } as any} />
                    {counterAnim ? (
                      <AnimatedCounterText
                        animValue={counterAnim}
                        targetValue={s.count}
                        style={[styles.streakPillText, { color: isFreeze ? theme.blue.sub : onSolid(s.color(theme)) }]}
                        format={(v) => v + "d " + s.label.toUpperCase()}
                      />
                    ) : (
                      <Text style={[styles.streakPillText, { color: isFreeze ? theme.blue.sub : onSolid(s.color(theme)) }]}>
                        {s.count}d {s.label.toUpperCase()}
                      </Text>
                    )}
                    {isFreeze && (
                      <ThemedIcon slot="ui.freeze" size={10} style={{ position: "absolute", top: -4, right: -4 } as any} />
                    )}
                  </Pressable>
                  <ConfettiBurst burstKey={confettiKeys[s.label] ?? 0} />
                </Animated.View>
              );
            })}
          </View>
        </ScrollView>
      ) : null}

      {/* Streak freeze row */}
      {allStreaks.some(s => s.count > 0) && freezeStatus != null && (
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
          {freezeStatus.available ? (
            <Pressable
              onPress={onFreezeStreak}
              style={[styles.freezeBtn, { backgroundColor: theme.blue.tint, borderColor: theme.blue.solid }]}
              accessibilityRole="button"
              accessibilityLabel="Freeze your streak"
            >
              <Ionicons name="snow-outline" size={13} color={theme.blue.fg} />
              <Text style={{ color: theme.blue.fg, fontSize: FONT_SIZES.caption, fontWeight: "800", marginLeft: 4 }}>
                Freeze Streak
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: "600" }}>
              ❄️ Freeze used this month
            </Text>
          )}
        </View>
      )}

      {/* Weekly activity summary — one-liner below streak pills */}
      {!loading && weeklyData.length > 0 && (() => {
        const moodDays = weeklyData.filter(d => d.avg_mood !== null).length;
        const activeDays = weeklyData.filter(d => d.avg_mood !== null || d.sleep_hours > 0 || d.total_spent > 0).length;
        if (activeDays === 0) return null;
        const topStreakEntry = allStreaks.length > 0 ? allStreaks.reduce((best, s) => s.count > best.count ? s : best) : null;
        return (
          <Text style={{ fontSize: FONT_SIZES.caption, color: theme.textSoft, marginTop: 8, fontWeight: "600" }}>
            {moodDays > 0 ? `${moodDays}/${weeklyData.length} mood days` : `${activeDays}/${weeklyData.length} active days`}
            {topStreakEntry && topStreakEntry.count >= 2 ? ` · ${topStreakEntry.count}d ${topStreakEntry.label.toLowerCase()} streak 🔥` : ""}
          </Text>
        );
      })()}
      {/* Motivational milestone message */}
      {!loading && allStreaks.length > 0 && (() => {
        const best = Math.max(...allStreaks.map(s => s.count));
        const msg = streakMotivationMessage(best);
        if (!msg) return null;
        return (
          <Text style={{ fontSize: FONT_SIZES.label, color: theme.teal.solid, marginTop: 5, fontWeight: "700" }}>{msg}</Text>
        );
      })()}
    </View>
  );
}

const styles = StyleSheet.create({
  headerBlock: { marginBottom: 4 },
  greeting: { fontSize: FONT_SIZES.title, fontWeight: "900", letterSpacing: -0.8, marginBottom: 2 },
  dateText: { fontSize: FONT_SIZES.body, marginBottom: 8, fontWeight: "600" },
  streakPill: {
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    elevation: 2,
  },
  streakPillText: { fontSize: FONT_SIZES.caption, fontWeight: "800", letterSpacing: 0.5 },
  freezeBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
});
