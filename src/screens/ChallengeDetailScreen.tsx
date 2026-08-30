import React, { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES, SPACING } from "../theme/tokens";
import { ThemedIcon } from "../theme/iconRegistry";
import { ShadowCard } from "../components/ShadowCard";
import { SectionLabel } from "../components/SectionLabel";
import { toast } from "../lib/toast";
import { RANK_COLORS } from "../constants";
import {
  getChallenge,
  leaveChallenge,
  ChallengeDetail,
  ChallengeParticipant,
  SocialCategory,
} from "../api/friends";
import { formatDateLocal } from "../utils/dateUtils";
import { ScreenBackground } from "../components/ScreenBackground";

const CATEGORY_ICON: Record<SocialCategory, keyof typeof Ionicons.glyphMap> = {
  steps: "footsteps-outline",
  exercise: "barbell-outline",
  hobbies: "star-outline",
  books: "book-outline",
};

function formatValue(value: number, category: SocialCategory): string {
  if (category === "steps") return value.toLocaleString() + " steps";
  if (category === "exercise" || category === "hobbies") {
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (h === 0) return m + " min";
    if (m === 0) return h + "h";
    return h + "h " + m + "m";
  }
  if (category === "books") return value + (value === 1 ? " book" : " books");
  return String(value);
}

function daysRemaining(endDate: string): number {
  // Parse "YYYY-MM-DD" as a LOCAL date (end of day) to avoid UTC off-by-one.
  const [y, m, d] = endDate.split("-").map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/** Parse a "YYYY-MM-DD" string as a LOCAL date (avoids UTC shift on render). */
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function ChallengeDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const challengeId: string = route.params?.challengeId;

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!challengeId) return;
      let cancelled = false;
      setLoading(true);
      getChallenge(challengeId)
        .then((data) => { if (!cancelled) setChallenge(data); })
        .catch(() => { if (!cancelled) setChallenge(null); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [challengeId])
  );

  function handleRefresh() {
    if (!challengeId) return;
    setRefreshing(true);
    getChallenge(challengeId)
      .then((data) => setChallenge(data))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }

  async function handleLeave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      "Leave Challenge",
      "Are you sure you want to leave this challenge?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            setLeaving(true);
            try {
              await leaveChallenge(challengeId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              toast("You've left the challenge.");
              navigation.goBack();
            } catch (e: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast(e?.message ?? "Could not leave challenge.", "error");
            } finally {
              setLeaving(false);
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.purple.solid} size="large" />
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.page, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Ionicons name="alert-circle-outline" size={40} color={theme.textSoft} />
        <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.subheading, marginTop: SPACING.md, textAlign: "center" }}>
          Could not load challenge details.
        </Text>
      </View>
    );
  }

  const today = formatDateLocal(new Date());
  const isPast = challenge.end_date < today;
  const days = daysRemaining(challenge.end_date);
  const participants: ChallengeParticipant[] = Array.isArray(challenge.participants)
    ? [...challenge.participants].sort((a, b) => a.rank - b.rank)
    : [];
  const myParticipant = participants.find((p) => p.is_me);

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground />
      <ScrollView
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.solid} colors={[theme.teal.solid]} />}
      >
      {/* Header */}
      <ShadowCard padding={16} bg={theme.purple.tint} accent={theme.purple.solid}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.iconBadge, { backgroundColor: theme.purple.solid, borderColor: theme.cardBorder }]}>
            <Ionicons name={CATEGORY_ICON[challenge.category]} size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.purple.fg, fontSize: FONT_SIZES.heading, fontWeight: "900", flexShrink: 1 }}>
              {challenge.title}
            </Text>
            <Text style={{ color: theme.purple.sub, fontSize: FONT_SIZES.label, marginTop: 2 }}>
              {challenge.category.charAt(0).toUpperCase() + challenge.category.slice(1)}
            </Text>
          </View>
        </View>

        <Text style={{ color: theme.purple.fg, fontSize: FONT_SIZES.body, marginTop: SPACING.md }}>
          {challenge.goal_description}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.metaBadge, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="calendar-outline" size={12} color={theme.textSoft} />
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginLeft: 4 }}>
              {parseLocalDate(challenge.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" – "}
              {parseLocalDate(challenge.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          </View>
          <View style={[styles.metaBadge, { backgroundColor: isPast ? theme.card : theme.teal.tint, borderColor: isPast ? theme.cardBorder : theme.teal.solid }]}>
            <Ionicons name="time-outline" size={12} color={isPast ? theme.textSoft : theme.teal.fg} />
            <Text style={{ color: isPast ? theme.textSoft : theme.teal.fg, fontSize: FONT_SIZES.caption, marginLeft: 4 }}>
              {isPast ? "Ended" : days + " day" + (days === 1 ? "" : "s") + " left"}
            </Text>
          </View>
          <View style={[styles.metaBadge, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="people-outline" size={12} color={theme.textSoft} />
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginLeft: 4 }}>
              {challenge.participant_count} {challenge.participant_count === 1 ? "participant" : "participants"}
            </Text>
          </View>
        </View>
      </ShadowCard>

      {/* My progress banner */}
      {myParticipant && (
        <View style={[styles.myBanner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
          <Ionicons name="person-circle-outline" size={20} color={theme.teal.fg} />
          <Text style={{ color: theme.teal.fg, fontWeight: "800", fontSize: FONT_SIZES.label, marginLeft: SPACING.sm, flex: 1 }}>
            Your progress: {formatValue(myParticipant.progress, challenge.category)} — Rank #{myParticipant.rank}
          </Text>
        </View>
      )}

      {/* Participant leaderboard */}
      <SectionLabel text="Participants" style={{ marginTop: 4, marginBottom: -4 }} />
      {participants.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder, alignItems: "center" }]}>
          <Ionicons name="people-outline" size={28} color={theme.textSoft} />
          <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.body, fontWeight: "800", marginTop: SPACING.xs }}>You're first here!</Text>
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, marginTop: SPACING.xs, textAlign: "center" }}>
            Invite a friend to join this challenge.
          </Text>
        </View>
      ) : (
        <View style={[styles.board, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {participants.map((p, i) => {
            const isTop3 = p.rank <= 3;
            const medalColor = RANK_COLORS[p.rank] ?? theme.textSoft;
            return (
              <View key={p.user_id + String(i)}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                <View style={[styles.entryRow, p.is_me && { backgroundColor: theme.teal.tint }]}>
                  <View style={[styles.rankBadge, isTop3 && { backgroundColor: medalColor + "22", borderColor: medalColor }]}>
                    <Text style={{ color: isTop3 ? medalColor : theme.textSoft, fontWeight: "900", fontSize: FONT_SIZES.body }}>
                      {p.rank}
                    </Text>
                  </View>
                  <Text style={{ flex: 1, color: theme.textStrong, fontSize: FONT_SIZES.body, fontWeight: p.is_me ? "900" : "600", marginLeft: SPACING.sm }}>
                    {p.display_name}{p.is_me ? " (you)" : ""}
                  </Text>
                  <Text style={{ color: p.is_me ? theme.teal.fg : theme.textStrong, fontWeight: "800", fontSize: FONT_SIZES.label }}>
                    {formatValue(p.progress, challenge.category)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Encouragement */}
      {!isPast && (
        <View style={[styles.encourageNote, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, textAlign: "center" }}>
            Keep going — every bit of effort counts. Consistent progress is the goal, not just the finish line.
          </Text>
        </View>
      )}

      {/* Leave button — only for participants of active/upcoming challenges */}
      {myParticipant && !isPast && (
        <Pressable
          onPress={handleLeave}
          disabled={leaving}
          style={[styles.leaveBtn, { borderColor: theme.ink, backgroundColor: theme.card }]}
        >
          {leaving ? (
            <ActivityIndicator color={theme.textSoft} size="small" />
          ) : (
            <Text style={{ color: theme.textSoft, fontWeight: "700", fontSize: FONT_SIZES.body }}>
              Leave Challenge
            </Text>
          )}
        </Pressable>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 100 },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md, flexWrap: "wrap" },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  myBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: SPACING.lg,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
  },
  board: {
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  divider: { height: 1, marginHorizontal: SPACING.base },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.base,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  encourageNote: {
    borderWidth: 1.5,
    borderRadius: SPACING.lg,
    padding: SPACING.md,
  },
  emptyCard: {
    borderWidth: 2,
    borderRadius: SPACING.lg,
    padding: SPACING.lg,
  },
  leaveBtn: {
    borderWidth: 2,
    borderRadius: SPACING.lg,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
});
