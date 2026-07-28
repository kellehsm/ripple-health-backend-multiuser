import React, { useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "../components/ShadowCard";
import { getChallenges, Challenge, SocialCategory } from "../api/friends";

const CATEGORY_ICON: Record<SocialCategory, keyof typeof Ionicons.glyphMap> = {
  steps: "footsteps-outline",
  exercise: "barbell-outline",
  hobbies: "star-outline",
  books: "book-outline",
};

function daysRemaining(endDate: string): number {
  const end = new Date(endDate + "T23:59:59Z");
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const e = new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return s + " – " + e;
}

export function ChallengesScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      getChallenges()
        .then((data) => { if (!cancelled) setChallenges(Array.isArray(data) ? data : []); })
        .catch(() => { if (!cancelled) setChallenges([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [])
  );

  const today = new Date().toISOString().slice(0, 10);
  const active = challenges.filter((c) => c.end_date >= today && c.start_date <= today);
  const upcoming = challenges.filter((c) => c.start_date > today);
  const past = challenges.filter((c) => c.end_date < today);

  function renderChallenge(challenge: Challenge) {
    const days = daysRemaining(challenge.end_date);
    const isPast = challenge.end_date < today;
    return (
      <Pressable
        key={challenge.id}
        onPress={() => navigation.navigate("ChallengeDetail", { challengeId: challenge.id })}
        style={[styles.challengeCard, { backgroundColor: theme.card, borderColor: theme.ink }]}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.iconBadge, { backgroundColor: theme.purple.tint, borderColor: theme.purple.solid }]}>
            <Ionicons name={CATEGORY_ICON[challenge.category]} size={20} color={theme.purple.fg} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: theme.textStrong, fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
              {challenge.title}
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 1 }}>
              {challenge.category.charAt(0).toUpperCase() + challenge.category.slice(1)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
        </View>

        <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 8 }}>
          {challenge.goal_description}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.metaBadge, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Ionicons name="people-outline" size={12} color={theme.textSoft} />
            <Text style={{ color: theme.textSoft, fontSize: 11, marginLeft: 4 }}>
              {challenge.participant_count} {challenge.participant_count === 1 ? "participant" : "participants"}
            </Text>
          </View>
          <View style={[styles.metaBadge, { backgroundColor: isPast ? theme.card : theme.teal.tint, borderColor: isPast ? theme.cardBorder : theme.teal.solid }]}>
            <Ionicons name="calendar-outline" size={12} color={isPast ? theme.textSoft : theme.teal.fg} />
            <Text style={{ color: isPast ? theme.textSoft : theme.teal.fg, fontSize: 11, marginLeft: 4 }}>
              {isPast ? "Ended " + formatDateRange(challenge.start_date, challenge.end_date) : days + " day" + (days === 1 ? "" : "s") + " left"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator color={theme.purple.solid} size="large" />
          </View>
        ) : challenges.length === 0 ? (
          <ShadowCard padding={20}>
            <View style={{ alignItems: "center", gap: 12 }}>
              <Ionicons name="trophy-outline" size={44} color={theme.purple.solid} />
              <Text style={{ color: theme.textStrong, fontSize: 17, fontWeight: "800", textAlign: "center" }}>
                No challenges yet
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: "center" }}>
                Create a challenge to compete with friends on steps, exercise, hobbies, or books.
              </Text>
            </View>
          </ShadowCard>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <Text style={[styles.groupLabel, { color: theme.textSoft }]}>ACTIVE</Text>
                {active.map(renderChallenge)}
              </>
            )}
            {upcoming.length > 0 && (
              <>
                <Text style={[styles.groupLabel, { color: theme.textSoft }]}>UPCOMING</Text>
                {upcoming.map(renderChallenge)}
              </>
            )}
            {past.length > 0 && (
              <>
                <Text style={[styles.groupLabel, { color: theme.textSoft }]}>PAST</Text>
                {past.map(renderChallenge)}
              </>
            )}
          </>
        )}

        {/* Privacy note */}
        <View style={[styles.privacyNote, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Ionicons name="shield-checkmark-outline" size={14} color={theme.textSoft} style={{ marginRight: 6 }} />
          <Text style={{ color: theme.textSoft, fontSize: 11, flex: 1 }}>
            Challenges only involve steps, exercise, hobbies, and books. All other data stays private.
          </Text>
        </View>
      </ScrollView>

      {/* FAB */}
      <Pressable
        onPress={() => navigation.navigate("NewChallenge")}
        style={[styles.fab, { backgroundColor: theme.purple.solid, borderColor: theme.ink }]}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 100 },
  groupLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 6,
    marginBottom: 0,
    textTransform: "uppercase",
  },
  challengeCard: {
    borderWidth: 2,
    borderRadius: 22,
    padding: 14,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: { flexDirection: "row", alignItems: "center" },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 10,
    marginTop: 4,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "rgba(60,40,20,0.2)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 6,
  },
});
