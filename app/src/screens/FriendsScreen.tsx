import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { onSolid } from "../theme/colorUtils";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "../components/ShadowCard";
import { toast } from "../lib/toast";
import { FeatureTour, TourStep } from "../components/FeatureTour";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { hasDoneFriendsOnboarding } from "./FriendsOnboardingScreen";
import {
  getFriends,
  getFriendRequests,
  getChallenges,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  setUsername,
  sendNudge,
  getNudges,
  getActivityFeed,
  Friend,
  FriendRequest,
  Challenge,
  Nudge,
  FeedEntry,
  SocialCategory,
} from "../api/friends";
import { api } from "../api/client";

const CATEGORY_ICON: Record<SocialCategory, keyof typeof Ionicons.glyphMap> = {
  steps: "footsteps-outline",
  exercise: "barbell-outline",
  hobbies: "star-outline",
  books: "book-outline",
};

const CATEGORY_LABEL: Record<SocialCategory, string> = {
  steps: "Steps this week",
  exercise: "Exercise this week",
  hobbies: "Hobbies this week",
  books: "Books this month",
};

const CATEGORIES: SocialCategory[] = ["steps", "exercise", "hobbies", "books"];

function FriendsEmptyState({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  const c = theme.teal.solid;
  return (
    <View style={{ alignItems: "center", paddingVertical: 48 }}>
      <Svg width={120} height={100} viewBox="0 0 120 100">
        <Circle cx="44" cy="45" r="28" fill={c} opacity={0.18} />
        <Circle cx="76" cy="45" r="28" fill={c} opacity={0.18} />
        <Circle cx="44" cy="38" r="18" stroke={c} strokeWidth="4" fill="none" opacity={0.7} />
        <Circle cx="76" cy="38" r="18" stroke={c} strokeWidth="4" fill="none" opacity={0.7} />
        <Circle cx="44" cy="38" r="8" fill={c} opacity={0.45} />
        <Circle cx="76" cy="38" r="8" fill={c} opacity={0.45} />
      </Svg>
      <Text style={{ fontSize: 16, fontWeight: "700", color: theme.textStrong, marginTop: 16 }}>No friends yet</Text>
      <Text style={{ fontSize: 13, color: theme.textSoft, marginTop: 6, textAlign: "center", maxWidth: 240 }}>
        Invite someone to join and start tracking wellness together
      </Text>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); onPress(); }}
        style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22, borderWidth: 2, borderColor: theme.ink, backgroundColor: theme.teal.solid }}
      >
        <Text style={{ fontWeight: "700", color: onSolid(theme.teal.solid) }}>Invite a friend</Text>
      </Pressable>
    </View>
  );
}

export function FriendsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const [username, setUsernameState] = useState<string | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);

  const [addInput, setAddInput] = useState("");
  const [sending, setSending] = useState(false);

  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  const [actingOnRequest, setActingOnRequest] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [nudgingSent, setNudgingSent] = useState<string | null>(null);
  const [activityFeed, setActivityFeed] = useState<FeedEntry[]>([]);

  // Feature tour refs
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const lastFetchedAt = useRef(0);
  const usernameRef = useRef<View>(null);
  const addFriendRef = useRef<View>(null);
  const leaderboardRef = useRef<View>(null);
  const challengesRef = useRef<View>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);

  const TOUR_STEPS: TourStep[] = [
    { ref: usernameRef,    title: "Your Username",      body: "Set a username so friends can find and add you by name instead of email." },
    { ref: addFriendRef,   title: "Add Friends",        body: "Enter a friend's email or username to send them a request. They'll need to accept before you can compare." },
    { ref: leaderboardRef, title: "Leaderboards",       body: "See how you stack up against friends on steps, exercise, hobbies, and books — the only data ever shared." },
    { ref: challengesRef,  title: "Challenges",         body: "Create a shared goal with friends — read 3 books this month, hit 10,000 steps daily — and cheer each other on." },
  ];

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFetchedAt.current < 60_000) return;
      lastFetchedAt.current = now;
      let cancelled = false;
      async function load() {
        setLoading(true);
        try {
          const [me, reqs, friendList, cList, nudgeList, feed] = await Promise.all([
            api.me().catch(() => null),
            getFriendRequests().catch(() => []),
            getFriends().catch(() => []),
            getChallenges().catch(() => []),
            getNudges().catch(() => []),
            getActivityFeed().catch(() => []),
          ]);
          if (cancelled) return;
          setUsernameState(me?.username ?? null);
          setRequests(Array.isArray(reqs) ? reqs : []);
          setFriends(Array.isArray(friendList) ? friendList : []);
          setChallenges(Array.isArray(cList) ? cList : []);
          setNudges(Array.isArray(nudgeList) ? nudgeList : []);
          setActivityFeed(Array.isArray(feed) ? feed : []);

          // Show feature tour first time
          const seen = await hasSeenTooltip("friends-tour");
          if (!seen && !cancelled) {
            markTooltipSeen("friends-tour");
            setTimeout(() => setShowTour(true), 500);
          }
        } catch {
          // silently ignore
        } finally {
          if (!cancelled) setLoading(false);
        }
      }

      // Check onboarding first — redirect if not done
      hasDoneFriendsOnboarding().then((done) => {
        if (!done && !cancelled) {
          navigation.replace("FriendsOnboarding");
        } else {
          load();
        }
      });

      return () => { cancelled = true; };
    }, [])
  );

  async function handleSaveUsername() {
    const trimmed = usernameInput.trim();
    if (!trimmed) return;
    setSavingUsername(true);
    try {
      await setUsername(trimmed);
      setUsernameState(trimmed);
      setEditingUsername(false);
      setUsernameInput("");
      toast("Username saved!");
    } catch (e: any) {
      toast(e?.message ?? "Could not save username.", "error");
    } finally {
      setSavingUsername(false);
    }
  }

  async function handleSendRequest() {
    const trimmed = addInput.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await sendFriendRequest(trimmed);
      setAddInput("");
      toast("Friend request sent!");
    } catch (e: any) {
      toast(e?.message ?? "Could not send request.", "error");
    } finally {
      setSending(false);
    }
  }

  async function handleAccept(connectionId: string) {
    setActingOnRequest(connectionId);
    try {
      await acceptFriendRequest(connectionId);
      setRequests((prev) => prev.filter((r) => r.connection_id !== connectionId));
      toast("Friend request accepted!");
      const updated = await getFriends().catch(() => null);
      if (updated) setFriends(updated);
    } catch (e: any) {
      toast(e?.message ?? "Could not accept request.", "error");
    } finally {
      setActingOnRequest(null);
    }
  }

  async function handleNudge(friend: Friend) {
    setNudgingSent(friend.connection_id);
    try {
      await sendNudge(friend.user_id);
      toast("Nudge sent to " + (friend.username ? "@" + friend.username : friend.email) + "!");
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("429") || msg.toLowerCase().includes("already nudged")) {
        toast("Already nudged recently.", "error");
      } else {
        toast(msg || "Could not send nudge.", "error");
      }
    } finally {
      setNudgingSent(null);
    }
  }

  async function handleDecline(connectionId: string) {
    setActingOnRequest(connectionId);
    try {
      await declineFriendRequest(connectionId);
      setRequests((prev) => prev.filter((r) => r.connection_id !== connectionId));
      toast("Request declined.");
    } catch (e: any) {
      toast(e?.message ?? "Could not decline request.", "error");
    } finally {
      setActingOnRequest(null);
    }
  }

  const activeChallenges = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    return challenges.filter(c => c.end_date >= now);
  }, [challenges]);

  return (
    <>
    <ScrollView
      ref={scrollRef}
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={[styles.content, tourPadding > 0 && { paddingBottom: tourPadding }]}
      onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
    >
      {/* Nudge banner */}
      {nudges.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid, paddingHorizontal: 14, paddingVertical: 12, gap: 4 }]}>
          {nudges.slice(0, 3).map((n, i) => (
            <Text key={i} style={{ color: theme.teal.fg, fontSize: 13, fontWeight: "700" }}>
              👋 {n.display_name} nudged you!
            </Text>
          ))}
          {nudges.length > 3 && (
            <Text style={{ color: theme.teal.sub, fontSize: 12 }}>+{nudges.length - 3} more</Text>
          )}
        </View>
      )}

      {/* My Username */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>MY USERNAME</Text>
      <View ref={usernameRef}>
      <ShadowCard padding={14}>
        {username && !editingUsername ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginBottom: 4 }}>
                YOUR USERNAME
              </Text>
              <Text style={{ color: theme.textStrong, fontSize: 18, fontWeight: "800", lineHeight: 24 }}>
                @{username}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 5, lineHeight: 17 }}>
                Friends can find you using this name.
              </Text>
            </View>
            <Pressable
              onPress={() => { setEditingUsername(true); setUsernameInput(username); }}
              style={[styles.smallBtn, { borderColor: theme.ink, backgroundColor: theme.card }]}
            >
              <Ionicons name="pencil-outline" size={14} color={theme.textStrong} />
              <Text style={{ color: theme.textStrong, fontSize: 12, fontWeight: "700", marginLeft: 4 }}>Edit</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {!username && !editingUsername && (
              <Text style={{ color: theme.textSoft, fontSize: 13, marginBottom: 4 }}>
                Set a username so friends can find you.
              </Text>
            )}
            <View style={styles.inputRow}>
              <TextInput
                value={usernameInput}
                onChangeText={setUsernameInput}
                placeholder="Choose a username"
                placeholderTextColor={theme.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.textInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card, flex: 1 }]}
              />
              <Pressable
                onPress={handleSaveUsername}
                disabled={savingUsername}
                style={[styles.actionBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
              >
                {savingUsername ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.actionBtnText}>SAVE</Text>
                )}
              </Pressable>
              {editingUsername && (
                <Pressable
                  onPress={() => { setEditingUsername(false); setUsernameInput(""); }}
                  style={[styles.actionBtn, { backgroundColor: theme.card, borderColor: theme.ink }]}
                >
                  <Text style={[styles.actionBtnText, { color: theme.textSoft }]}>CANCEL</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </ShadowCard>

      </View>

      {/* Add a Friend */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>ADD A FRIEND</Text>
      <View ref={addFriendRef}>
      <ShadowCard padding={14}>
        <View style={styles.inputRow}>
          <TextInput
            value={addInput}
            onChangeText={setAddInput}
            placeholder="Email or username"
            placeholderTextColor={theme.textSoft}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={[styles.textInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card, flex: 1 }]}
          />
          <Pressable
            onPress={handleSendRequest}
            disabled={sending}
            style={[styles.actionBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>SEND</Text>
            )}
          </Pressable>
        </View>
      </ShadowCard>
      </View>

      {/* Friend Requests */}
      {requests.length > 0 && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>
            FRIEND REQUESTS ({requests.length})
          </Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {requests.map((req, i) => (
              <View key={req.connection_id}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                <View style={styles.requestRow}>
                  <View style={styles.avatarCircle}>
                    <Ionicons name="person-outline" size={18} color={theme.teal.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: 14, lineHeight: 19 }}>
                      {req.from_username ? "@" + req.from_username : req.from_email}
                    </Text>
                    {req.from_username && (
                      <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>{req.from_email}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => handleAccept(req.connection_id)}
                    disabled={actingOnRequest === req.connection_id}
                    style={[styles.smallBtn, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
                  >
                    <Text style={{ color: theme.teal.fg, fontSize: 12, fontWeight: "700" }}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDecline(req.connection_id)}
                    disabled={actingOnRequest === req.connection_id}
                    style={[styles.smallBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  >
                    <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: "600" }}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* My Friends */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>MY FRIENDS</Text>
      {loading ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, alignItems: "center", paddingVertical: 20 }]}>
          <ActivityIndicator color={theme.teal.bar} />
        </View>
      ) : friends.length === 0 ? (
        <FriendsEmptyState onPress={() => Haptics.selectionAsync()} />
      ) : (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {friends.map((friend, i) => (
            <View key={friend.connection_id}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
              <View style={styles.friendRow}>
                <View style={styles.avatarCircle}>
                  <Ionicons name="person-outline" size={18} color={theme.teal.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: 14, lineHeight: 19 }}>
                    {friend.username ? "@" + friend.username : friend.email}
                  </Text>
                  {friend.username && (
                    <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>{friend.email}</Text>
                  )}
                  <View style={styles.sharingRow}>
                    <Text style={{ color: theme.textSoft, fontSize: 11, marginRight: 6 }}>Sharing:</Text>
                    {(["steps", "exercise", "hobbies", "books"] as SocialCategory[]).map((cat) =>
                      friend.sharing?.[cat] ? (
                        <View key={cat} style={[styles.sharingBadge, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                          <Ionicons name={CATEGORY_ICON[cat]} size={11} color={theme.teal.fg} />
                        </View>
                      ) : null
                    )}
                    {!friend.sharing?.steps && !friend.sharing?.exercise && !friend.sharing?.hobbies && !friend.sharing?.books && (
                      <Text style={{ color: theme.textSoft, fontSize: 11, fontStyle: "italic" }}>nothing yet</Text>
                    )}
                  </View>
                </View>
                <Pressable
                  onPress={() => handleNudge(friend)}
                  disabled={nudgingSent === friend.connection_id}
                  style={[styles.smallBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                >
                  {nudgingSent === friend.connection_id ? (
                    <ActivityIndicator size="small" color={theme.teal.fg} />
                  ) : (
                    <Text style={{ fontSize: 16 }}>👋</Text>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Friend Activity Feed */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>FRIEND ACTIVITY</Text>
      {activityFeed.length === 0 ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, paddingHorizontal: 14, paddingVertical: 12 }]}>
          <Text style={{ color: theme.textSoft, fontSize: 13 }}>Quiet week so far — no streaks to celebrate yet.</Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {activityFeed.map((entry, i) => (
            <View key={entry.user_id}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
              <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
                <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: 14, marginBottom: 8, lineHeight: 19 }}>
                  {entry.display_name}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {entry.milestones.map((m) => (
                    <View key={m.type} style={[styles.feedBadge, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                      <Text style={{ fontSize: 13 }}>
                        {m.type === "steps_streak" ? "👟" : m.type === "exercise_streak" ? "💪" : "📖"}
                      </Text>
                      <Text style={{ color: theme.teal.fg, fontSize: 12, fontWeight: "700", marginLeft: 4 }}>
                        {m.count}d {m.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Leaderboards */}
      <View ref={leaderboardRef}>
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>LEADERBOARDS</Text>
      <Text style={{ color: theme.textSoft, fontSize: 12, marginBottom: 8, lineHeight: 17 }}>
        Only steps, exercise, hobbies, and books are compared — all other data stays private.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            onPress={() => navigation.navigate("Leaderboard", { category: cat })}
            style={[styles.leaderboardCard, { backgroundColor: theme.card, borderColor: theme.ink }]}
          >
            <Ionicons name={CATEGORY_ICON[cat]} size={26} color={theme.teal.solid} />
            <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "800", marginTop: 6, textAlign: "center" }}>
              {CATEGORY_LABEL[cat]}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textSoft} style={{ marginTop: 4 }} />
          </Pressable>
        ))}
      </View>

      </View>

      {/* Challenges */}
      <View ref={challengesRef}>
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>CHALLENGES</Text>
      <Pressable
        onPress={() => navigation.navigate("Challenges")}
        style={[styles.challengeBtn, { backgroundColor: theme.purple.tint, borderColor: theme.ink }]}
      >
        <Ionicons name="trophy-outline" size={20} color={theme.purple.fg} />
        <Text style={{ color: theme.purple.fg, fontWeight: "800", fontSize: 15, flex: 1, marginLeft: 10 }}>
          See Challenges
          {activeChallenges.length > 0 ? " (" + activeChallenges.length + " active)" : ""}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={theme.purple.fg} />
      </Pressable>
      </View>
    </ScrollView>

    <FeatureTour
      steps={TOUR_STEPS}
      visible={showTour}
      onDone={() => setShowTour(false)}
      scrollRef={scrollRef}
      scrollY={scrollOffsetRef.current}
      onExtraPadding={setTourPadding}
    />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  card: {
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
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  textInput: {
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    shadowColor: "rgba(60,40,20,0.08)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  actionBtn: {
    borderRadius: 16,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 60,
  },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 0.4 },
  smallBtn: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  sharingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
    gap: 4,
  },
  sharingBadge: {
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 3,
  },
  feedBadge: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  leaderboardCard: {
    width: "47%",
    borderWidth: 2,
    borderRadius: 22,
    padding: 14,
    alignItems: "center",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  challengeBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
});
