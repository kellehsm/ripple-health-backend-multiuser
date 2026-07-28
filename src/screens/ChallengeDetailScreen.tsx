import React, { useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "../components/ShadowCard";
import { toast } from "../lib/toast";
import {
  getChallenge,
  leaveChallenge,
  ChallengeDetail,
  ChallengeParticipant,
  SocialCategory,
} from "../api/friends";

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
  const end = new Date(endDate + "T23:59:59Z");
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

const RANK_COLORS = ["", "#F5B800", "#A8A8A8", "#C07A4A"];

export function ChallengeDetailScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const challengeId: string = route.params?.challengeId;

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
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

  async function handleLeave() {
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
              toast("You've left the challenge.");
              navigation.goBack();
            } catch (e: any) {
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
        <Text style={{ color: theme.textSoft, fontSize: 15, marginTop: 12, textAlign: "center" }}>
          Could not load challenge details.
        </Text>
      </View>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const isPast = challenge.end_date < today;
  const days = daysRemaining(challenge.end_date);
  const participants: ChallengeParticipant[] = Array.isArray(challenge.participants)
    ? [...challenge.participants].sort((a, b) => a.rank - b.rank)
    : [];
  const myParticipant = participants.find((p) => p.is_me);

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <ShadowCard padding={16} bg={theme.purple.tint} accent={theme.purple.solid}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={[styles.iconBadge, { backgroundColor: theme.purple.solid, borderColor: theme.ink }]}>
            <Ionicons name={CATEGORY_ICON[challenge.category]} size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.purple.fg, fontSize: 19, fontWeight: "900", flexShrink: 1 }}>
              {challenge.title}
            </Text>
            <Text style={{ color: theme.purple.sub, fontSize: 13, marginTop: 2 }}>
              {challenge.category.charAt(0).toUpperCase() + challenge.category.slice(1)}
            </Text>
          </View>
        </View>

        <Text style={{ color: theme.purple.fg, fontSize: 14, marginTop: 12 }}>
          {challenge.goal_description}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.metaBadge, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="calendar-outline" size={12} color={theme.textSoft} />
            <Text style={{ color: theme.textSoft, fontSize: 11, marginLeft: 4 }}>
              {new Date(challenge.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" – "}
              {new Date(challenge.end_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          </View>
          <View style={[styles.metaBadge, { backgroundColor: isPast ? theme.card : theme.teal.tint, borderColor: isPast ? theme.cardBorder : theme.teal.solid }]}>
            <Ionicons name="time-outline" size={12} color={isPast ? theme.textSoft : theme.teal.fg} />
            <Text style={{ color: isPast ? theme.textSoft : theme.teal.fg, fontSize: 11, marginLeft: 4 }}>
              {isPast ? "Ended" : days + " day" + (days === 1 ? "" : "s") + " left"}
            </Text>
          </View>
          <View style={[styles.metaBadge, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="people-outline" size={12} color={theme.textSoft} />
            <Text style={{ color: theme.textSoft, fontSize: 11, marginLeft: 4 }}>
              {challenge.participant_count} {challenge.participant_count === 1 ? "participant" : "participants"}
            </Text>
          </View>
        </View>
      </ShadowCard>

      {/* My progress banner */}
      {myParticipant && (
        <View style={[styles.myBanner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
          <Ionicons name="person-circle-outline" size={20} color={theme.teal.fg} />
          <Text style={{ color: theme.teal.fg, fontWeight: "800", fontSize: 13, marginLeft: 8, flex: 1 }}>
            Your progress: {formatValue(myParticipant.progress, challenge.category)} — Rank #{myParticipant.rank}
          </Text>
        </View>
      )}

      {/* Participant leaderboard */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>PARTICIPANTS</Text>
      {participants.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={{ color: theme.textSoft, fontSize: 13 }}>No participants yet.</Text>
        </View>
      ) : (
        <View style={[styles.board, { backgroundColor: theme.card, borderColor: theme.ink }]}>
          {participants.map((p, i) => {
            const isTop3 = p.rank <= 3;
            const medalColor = RANK_COLORS[p.rank] ?? theme.textSoft;
            return (
              <View key={p.user_id + String(i)}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                <View style={[styles.entryRow, p.is_me && { backgroundColor: theme.teal.tint }]}>
                  <View style={[styles.rankBadge, isTop3 && { backgroundColor: medalColor + "22", borderColor: medalColor }]}>
                    <Text style={{ color: isTop3 ? medalColor : theme.textSoft, fontWeight: "900", fontSize: 14 }}>
                      {p.rank}
                    </Text>
                  </View>
                  <Text style={{ flex: 1, color: theme.textStrong, fontSize: 14, fontWeight: p.is_me ? "900" : "600", marginLeft: 10 }}>
                    {p.display_name}{p.is_me ? " (you)" : ""}
                  </Text>
                  <Text style={{ color: p.is_me ? theme.teal.fg : theme.textStrong, fontWeight: "800", fontSize: 13 }}>
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
          <Text style={{ color: theme.textSoft, fontSize: 12, textAlign: "center" }}>
            Keep going — every bit of effort counts. Consistent progress is the goal, not just the finish line.
          </Text>
        </View>
      )}

      {/* Leave button */}
      <Pressable
        onPress={handleLeave}
        disabled={leaving}
        style={[styles.leaveBtn, { borderColor: theme.ink, backgroundColor: theme.card }]}
      >
        {leaving ? (
          <ActivityIndicator color={theme.textSoft} size="small" />
        ) : (
          <Text style={{ color: theme.textSoft, fontWeight: "700", fontSize: 14 }}>
            Leave Challenge
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: -4,
    textTransform: "uppercase",
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  myBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  board: {
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  divider: { height: 1, marginHorizontal: 14 },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
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
    borderRadius: 16,
    padding: 12,
  },
  emptyCard: {
    borderWidth: 2,
    borderRadius: 16,
    padding: 16,
  },
  leaveBtn: {
    borderWidth: 2,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
});
