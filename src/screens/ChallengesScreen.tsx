import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenBackground } from "../components/ScreenBackground";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "../components/ShadowCard";
import { EmptyState } from "../components/EmptyState";
import { getChallenges, getLeaderboard, Challenge, SocialCategory, LeaderboardEntry } from "../api/friends";
import { api } from "../api/client";
import { todayStr, fmtDateRange } from "../utils/dateUtils";
import { toast } from "../lib/toast";

function avatarColor(seed: string, theme: any): { bg: string; fg: string } {
  const palettes = [
    { bg: theme.teal?.tint ?? "#E0F7FA", fg: theme.teal?.fg ?? "#00695C" },
    { bg: theme.purple?.tint ?? "#EDE7F6", fg: theme.purple?.fg ?? "#512DA8" },
    { bg: theme.coral?.tint ?? "#FBE9E7", fg: theme.coral?.fg ?? "#BF360C" },
    { bg: theme.amber?.tint ?? "#FFF8E1", fg: theme.amber?.fg ?? "#E65100" },
    { bg: theme.blue?.tint ?? "#E3F2FD", fg: theme.blue?.fg ?? "#1565C0" },
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}

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

type ChallengeTemplate = {
  id: string;
  title: string;
  description: string;
  icon: string;
  duration_days: number;
  difficulty: "easy" | "medium" | "hard";
  category: string;
};

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
  const [leaderboards, setLeaderboards] = useState<Record<SocialCategory, LeaderboardEntry[]>>({} as Record<SocialCategory, LeaderboardEntry[]>);
  const [expandedStandings, setExpandedStandings] = useState<Set<string>>(new Set());

  const [templates, setTemplates] = useState<ChallengeTemplate[]>([]);
  const templatesFetchedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!refreshing && Date.now() - lastFetchRef.current < 30_000) return () => { cancelled = true; };
      setLoading(true);
      setLoadError(false);
      lastFetchRef.current = Date.now();
      getChallenges()
        .then((data) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : [];
          setChallenges(list);
          // Fetch leaderboards for all unique categories
          const cats = [...new Set(list.map((c) => c.category))] as SocialCategory[];
          cats.forEach((cat) => {
            getLeaderboard(cat)
              .then((entries) => {
                if (!cancelled) setLeaderboards((prev) => ({ ...prev, [cat]: entries }));
              })
              .catch(() => {});
          });
        })
        .catch(() => { if (!cancelled) setLoadError(true); })
        .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false); } });
      return () => { cancelled = true; };
    }, [reloadKey, refreshing])
  );

  // Fetch templates once per session
  useEffect(() => {
    if (templatesFetchedRef.current) return;
    templatesFetchedRef.current = true;
    api.getChallengeTemplates()
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function difficultyColor(difficulty: ChallengeTemplate["difficulty"]): string {
    if (difficulty === "easy") return theme.success;
    if (difficulty === "medium") return theme.warning;
    return theme.danger;
  }

  function handleTemplatePress(tmpl: ChallengeTemplate) {
    Haptics.selectionAsync();
    Alert.alert(
      "Start " + tmpl.title + "?",
      tmpl.description,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Invite Friends",
          onPress: () => navigation.navigate("NewChallenge", { template: tmpl }),
        },
        {
          text: "Start Solo",
          onPress: async () => {
            try {
              await api.startChallengeFromTemplate(tmpl.id);
              toast("Challenge started!");
              setReloadKey((k) => k + 1);
            } catch (e: any) {
              toast(e?.message ?? "Could not start challenge.", "error");
            }
          },
        },
      ]
    );
  }

  const today = todayStr();
  const active = challenges.filter((c) => c.end_date >= today && c.start_date <= today);
  const upcoming = challenges.filter((c) => c.start_date > today);
  const past = challenges.filter((c) => c.end_date < today);

  function renderChallenge(challenge: Challenge) {
    const days = daysRemaining(challenge.end_date);
    const isPast = challenge.end_date < today;
    const lb: LeaderboardEntry[] = leaderboards[challenge.category] ?? [];
    const others = lb.filter((e) => !e.is_me);
    const avatarParticipants = others.slice(0, 3);
    const top3 = lb.slice(0, 3);
    const rankColors = [
      { bg: "#FFF9E6", fg: "#B8860B" }, // gold
      { bg: "#F5F5F5", fg: "#757575" }, // silver
      { bg: "#FBE9E7", fg: "#BF360C" }, // bronze
    ];
    const isExpanded = expandedStandings.has(challenge.id);

    return (
      <Pressable
        key={challenge.id}
        onPress={() => { Haptics.selectionAsync(); navigation.navigate("ChallengeDetail", { challengeId: challenge.id }); }}
        style={[styles.challengeCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
        accessibilityRole="button"
        accessibilityLabel={challenge.title}
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
          {/* Participant avatar circles */}
          {avatarParticipants.length > 0 && (
            <View style={{ flexDirection: "row", marginRight: 6 }}>
              {avatarParticipants.map((p, i) => {
                const ac = avatarColor(p.user_id, theme);
                const initials = (p.display_name || "?").charAt(0).toUpperCase();
                return (
                  <View
                    key={p.user_id}
                    style={{
                      width: 26, height: 26, borderRadius: 13,
                      backgroundColor: ac.bg,
                      alignItems: "center", justifyContent: "center",
                      borderWidth: 1.5, borderColor: theme.card,
                      marginLeft: i === 0 ? 0 : -8,
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "800", color: ac.fg }}>{initials}</Text>
                  </View>
                );
              })}
            </View>
          )}
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

        {/* Live standings expandable */}
        {top3.length > 0 && (
          <>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                Haptics.selectionAsync();
                setExpandedStandings((prev) => {
                  const next = new Set(prev);
                  if (next.has(challenge.id)) next.delete(challenge.id); else next.add(challenge.id);
                  return next;
                });
              }}
              style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 4 }}
              hitSlop={6}
            >
              <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={12} color={theme.purple.fg} />
              <Text style={{ color: theme.purple.fg, fontSize: 11, fontWeight: "700" }}>Live standings</Text>
            </Pressable>
            {isExpanded && (
              <View style={{ marginTop: 8, gap: 6 }}>
                {top3.map((entry, i) => {
                  const rc = rankColors[i] ?? rankColors[2];
                  const goalVal = challenge.goal_value ?? 1;
                  const progress = Math.min(1, goalVal > 0 ? entry.value / goalVal : 0);
                  return (
                    <View key={entry.user_id} style={{ gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: rc.bg, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontSize: 10, fontWeight: "800", color: rc.fg }}>{i + 1}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, color: entry.is_me ? theme.textStrong : theme.textSoft, fontWeight: entry.is_me ? "800" : "500" }} numberOfLines={1}>
                          {entry.is_me ? "You" : entry.display_name}
                        </Text>
                        <Text style={{ fontSize: 11, color: rc.fg, fontWeight: "700" }}>{entry.value.toLocaleString()}</Text>
                      </View>
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.cardBorder, overflow: "hidden" }}>
                        <View style={{ height: 4, width: `${Math.round(progress * 100)}%`, backgroundColor: rc.fg, borderRadius: 2 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Invite friend button for non-joined challenges */}
        {!challenge.is_member && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.selectionAsync();
              navigation.getParent()?.navigate("Friends");
            }}
            style={{ marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4 }}
            hitSlop={6}
          >
            <Text style={{ color: theme.purple.fg, fontSize: 12, fontWeight: "700" }}>Invite friend →</Text>
          </Pressable>
        )}
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
        {/* Quick Start templates */}
        {templates.length > 0 && (
          <>
            <Text style={[styles.groupLabel, { color: theme.textSoft }]}>QUICK START</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 4, paddingBottom: 4 }}
            >
              {templates.map((tmpl) => (
                <Pressable
                  key={tmpl.id}
                  onPress={() => handleTemplatePress(tmpl)}
                  style={[styles.templateCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  accessibilityRole="button"
                  accessibilityLabel={"Start " + tmpl.title}
                >
                  <View style={[styles.iconBadge, { backgroundColor: theme.purple.tint, borderColor: theme.purple.solid }]}>
                    <Ionicons name={(tmpl.icon as any) || "trophy-outline"} size={20} color={theme.purple.fg} />
                  </View>
                  <Text style={{ color: theme.textStrong, fontWeight: "800", fontSize: 13, marginTop: 8 }} numberOfLines={2}>
                    {tmpl.title}
                  </Text>
                  <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 2 }}>
                    {tmpl.duration_days}d
                  </Text>
                  <View style={[styles.diffBadge, { backgroundColor: difficultyColor(tmpl.difficulty) + "22", borderColor: difficultyColor(tmpl.difficulty) }]}>
                    <Text style={{ color: difficultyColor(tmpl.difficulty), fontSize: 10, fontWeight: "800" }}>
                      {tmpl.difficulty.toUpperCase()}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

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
  templateCard: {
    width: 120,
    borderWidth: 2,
    borderRadius: 18,
    padding: 12,
    alignItems: "flex-start",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  diffBadge: {
    marginTop: 8,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
