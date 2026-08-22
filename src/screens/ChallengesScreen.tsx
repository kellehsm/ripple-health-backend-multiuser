import React, { useCallback, useRef, useState } from "react";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenBackground } from "../components/ScreenBackground";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "../components/ShadowCard";
import { EmptyState } from "../components/EmptyState";
import { getChallenges, Challenge, SocialCategory } from "../api/friends";
import { todayStr, fmtDateRange } from "../utils/dateUtils";

const CATEGORY_ICON: Record<SocialCategory, keyof typeof Ionicons.glyphMap> = {
  steps: "footsteps-outline",
  exercise: "barbell-outline",
  hobbies: "star-outline",
  books: "book-outline",
};

function daysRemaining(endDate: string): number {
  // Parse "YYYY-MM-DD" as a LOCAL date (end of day) to avoid UTC off-by-one.
  const [y, m, d] = endDate.split("-").map(Number);
  const end = new Date(y, m - 1, d, 23, 59, 59);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function ChallengesScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const challengesIntro = findIntro("challenges")!;
  const [introVisible, dismissIntro] = useFeatureIntro(challengesIntro.key);

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const lastFetchRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!refreshing && Date.now() - lastFetchRef.current < 30_000) return () => { cancelled = true; };
      setLoading(true);
      setLoadError(false);
      lastFetchRef.current = Date.now();
      getChallenges()
        .then((data) => { if (!cancelled) setChallenges(Array.isArray(data) ? data : []); })
        .catch(() => { if (!cancelled) setLoadError(true); })
        .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false); } });
      return () => { cancelled = true; };
    }, [reloadKey, refreshing])
  );

  const today = todayStr();
  const active = challenges.filter((c) => c.end_date >= today && c.start_date <= today);
  const upcoming = challenges.filter((c) => c.start_date > today);
  const past = challenges.filter((c) => c.end_date < today);

  function renderChallenge(challenge: Challenge) {
    const days = daysRemaining(challenge.end_date);
    const isPast = challenge.end_date < today;
    return (
      <Pressable
        key={challenge.id}
        onPress={() => { Haptics.selectionAsync(); navigation.navigate("ChallengeDetail", { challengeId: challenge.id }); }}
        style={[styles.challengeCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
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
              {isPast ? "Ended " + fmtDateRange(challenge.start_date, challenge.end_date) : days + " day" + (days === 1 ? "" : "s") + " left"}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground pageId="challenges" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); setReloadKey((k) => k + 1); }}
            tintColor={theme.teal.solid}
            colors={[theme.teal.solid]}
          />
        }
      >
        {loading ? (
          <View style={{ gap: 12 }}>
            <ShadowCard skeleton skeletonHeight={88} />
            <ShadowCard skeleton skeletonHeight={88} />
            <ShadowCard skeleton skeletonHeight={88} />
          </View>
        ) : loadError ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 12 }}>
            <Ionicons name="cloud-offline-outline" size={28} color={theme.textSoft} />
            <Text style={{ color: theme.textStrong, fontWeight: "800", fontSize: 15 }}>
              Couldn't load challenges
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: "center" }}>
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => setReloadKey((k) => k + 1)}
              style={{
                borderWidth: 2,
                borderColor: theme.ink,
                borderRadius: 14,
                paddingHorizontal: 18,
                paddingVertical: 8,
                backgroundColor: theme.card,
              }}
            >
              <Text style={{ color: theme.textStrong, fontWeight: "800", fontSize: 13 }}>Retry</Text>
            </Pressable>
          </View>
        ) : challenges.length === 0 ? (
          <EmptyState
            slot="ui.trophy"
            title="No challenges yet"
            subtitle="Create a challenge to compete with friends on steps, exercise, hobbies, or books."
            action={{ label: "Create challenge", onPress: () => navigation.navigate("NewChallenge") }}
          />
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
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); navigation.navigate("NewChallenge"); }}
        style={[styles.fab, { backgroundColor: theme.purple.solid, borderColor: theme.ink }]}
        accessibilityRole="button"
        accessibilityLabel="Create a new challenge"
      >
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
      <FeatureIntroSheet intro={challengesIntro} visible={introVisible} onClose={dismissIntro} />
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
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
