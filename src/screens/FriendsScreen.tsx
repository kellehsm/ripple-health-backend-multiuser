import React, { useCallback, useEffect, useRef, useState } from "react";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import { ScreenBackground } from "../components/ScreenBackground";
import {
  ScrollView,
  RefreshControl,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Share,
  Alert,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { onSolid } from "../theme/colorUtils";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ThemedIcon } from "../theme/iconRegistry";
import { ShadowCard } from "../components/ShadowCard";
import { SectionLabel } from "../components/SectionLabel";
import { FONT_SIZES } from "../theme/tokens";
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
  sendCheer,
  getCheers,
  getMyCheersToday,
  getSocialNotifPrefs,
  SocialNotifPrefs,
  Friend,
  FriendRequest,
  Challenge,
  Nudge,
  Cheer,
  FeedEntry,
  SocialCategory,
} from "../api/friends";
import { api } from "../api/client";
import { todayStr } from "../utils/dateUtils";

type FriendActivity = {
  id: string;
  user_id: string;
  display_name: string;
  activity_type: "metric" | "exercise" | "mindfulness" | "challenge_joined";
  description: string;
  occurred_at: string;
};

function activityIcon(type: FriendActivity["activity_type"]): keyof typeof Ionicons.glyphMap {
  if (type === "exercise") return "barbell-outline";
  if (type === "mindfulness") return "leaf-outline";
  if (type === "challenge_joined") return "trophy-outline";
  return "fitness-outline";
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// --- Improvement 1: Colored initials avatars ---
function avatarColor(seed: string, theme: any): { bg: string; fg: string } {
  const colors = [
    { bg: theme.teal.tint, fg: theme.teal.fg },
    { bg: theme.purple.tint, fg: theme.purple.fg },
    { bg: (theme as any).amber?.tint ?? '#FEF3C7', fg: (theme as any).amber?.fg ?? '#92400E' },
    { bg: (theme as any).coral?.tint ?? '#FFF0F0', fg: (theme as any).coral?.solid ?? '#C0392B' },
    { bg: theme.blue?.tint ?? '#EFF6FF', fg: theme.blue?.fg ?? '#1E40AF' },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) & 0xffff;
  return colors[hash % colors.length];
}

function getInitial(friend: Friend): string {
  return (friend.username ?? friend.email ?? '?')[0].toUpperCase();
}

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
      <Text style={{ fontSize: FONT_SIZES.subheading, fontWeight: "700", color: theme.textStrong, marginTop: 16 }}>No friends yet</Text>
      <Text style={{ fontSize: FONT_SIZES.label, color: theme.textSoft, marginTop: 6, textAlign: "center", maxWidth: 240 }}>
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
  const friendsIntro = findIntro("friends")!;
  const [introVisible, dismissIntro] = useFeatureIntro(friendsIntro.key);

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
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [socialNotifPrefs, setSocialNotifPrefs] = useState<SocialNotifPrefs | null>(null);
  const [actingOnRequest, setActingOnRequest] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [nudgingSent, setNudgingSent] = useState<string | null>(null);
  const [activityFeed, setActivityFeed] = useState<FeedEntry[]>([]);
  const [cheers, setCheers] = useState<Cheer[]>([]);
  const [cheersSentToday, setCheersSentToday] = useState<Set<string>>(new Set());
  const [cheeringSent, setCheeringSent] = useState<string | null>(null);

  const [friendActivity, setFriendActivity] = useState<FriendActivity[]>([]);

  // Improvement 7: unified inbox tray state
  const [inboxExpanded, setInboxExpanded] = useState(true);

  // Feature tour refs
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const usernameRef = useRef<View>(null);
  const addFriendRef = useRef<View>(null);
  const leaderboardRef = useRef<View>(null);
  const challengesRef = useRef<View>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);
  const tourTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending tour timeout on unmount
  useEffect(() => {
    return () => {
      if (tourTimeoutRef.current) {
        clearTimeout(tourTimeoutRef.current);
        tourTimeoutRef.current = null;
      }
    };
  }, []);

  // Fetch friend activity feed once on mount
  useEffect(() => {
    let cancelled = false;
    api.getFriendActivityFeed()
      .then(data => { if (!cancelled) setFriendActivity(Array.isArray(data) ? data.slice(0, 10) : []); })
      .catch(() => { if (!cancelled) setFriendActivity([]); });
    return () => { cancelled = true; };
  }, []);

  const TOUR_STEPS: TourStep[] = [
    { ref: usernameRef,    title: "Your Username",      body: "Set a username so friends can find and add you by name instead of email." },
    { ref: addFriendRef,   title: "Add Friends",        body: "Enter a friend's email or username to send them a request. They'll need to accept before you can compare." },
    { ref: leaderboardRef, title: "Leaderboards",       body: "See how you stack up against friends on steps, exercise, hobbies, and books — the only data ever shared." },
    { ref: challengesRef,  title: "Challenges",         body: "Create a shared goal with friends — read 3 books this month, hit 10,000 steps daily — and cheer each other on." },
  ];

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        setLoading(true);
        setLoadError(false);
        let anyError = false;
        const tracked = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
          p.catch(() => { anyError = true; return fallback; });
        try {
          const [me, reqs, friendList, cList, nudgeList, feed, cheerList, cheersSent, notifPrefs] = await Promise.all([
            tracked(api.me(), null as any),
            tracked(getFriendRequests(), [] as FriendRequest[]),
            tracked(getFriends(), [] as Friend[]),
            tracked(getChallenges(), [] as Challenge[]),
            tracked(getNudges(), [] as Nudge[]),
            tracked(getActivityFeed(), [] as FeedEntry[]),
            tracked(getCheers(), [] as Cheer[]),
            tracked(getMyCheersToday(), [] as string[]),
            tracked(getSocialNotifPrefs(), null as SocialNotifPrefs | null),
          ]);
          if (cancelled) return;
          setLoadError(anyError);
          setUsernameState(me?.username ?? null);
          setRequests(Array.isArray(reqs) ? reqs : []);
          setFriends(Array.isArray(friendList) ? friendList : []);
          setChallenges(Array.isArray(cList) ? cList : []);
          setNudges(Array.isArray(nudgeList) ? nudgeList : []);
          setActivityFeed(Array.isArray(feed) ? feed : []);
          setCheers(Array.isArray(cheerList) ? cheerList : []);
          setCheersSentToday(new Set(Array.isArray(cheersSent) ? cheersSent : []));
          if (notifPrefs) setSocialNotifPrefs(notifPrefs);

          // Show feature tour first time
          const seen = await hasSeenTooltip("friends-tour");
          if (!seen && !cancelled) {
            if (tourTimeoutRef.current) clearTimeout(tourTimeoutRef.current);
            tourTimeoutRef.current = setTimeout(() => {
              tourTimeoutRef.current = null;
              markTooltipSeen("friends-tour");
              setShowTour(true);
            }, 500);
          }
        } catch {
          if (!cancelled) setLoadError(true);
        } finally {
          if (!cancelled) { setLoading(false); setRefreshing(false); }
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

      return () => {
        cancelled = true;
        if (tourTimeoutRef.current) {
          clearTimeout(tourTimeoutRef.current);
          tourTimeoutRef.current = null;
        }
      };
    }, [reloadKey])
  );

  async function handleInviteFriend() {
    try {
      await Share.share({
        message:
          "Join me on Ripple Wellness! We can compare steps, exercise, hobbies, and books, and take on challenges together." +
          (username ? " Add me — my username is @" + username + "." : ""),
      });
    } catch {
      // user dismissed the share sheet or sharing failed — nothing to do
    }
  }

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

  async function handleCheer(friend: Friend) {
    setCheeringSent(friend.user_id);
    try {
      await sendCheer(friend.user_id);
      setCheersSentToday((prev) => new Set([...prev, friend.user_id]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast("Cheer sent to " + (friend.username ? "@" + friend.username : friend.email) + "!");
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("429") || msg.toLowerCase().includes("already cheered")) {
        toast("Already cheered today.", "error");
        setCheersSentToday((prev) => new Set([...prev, friend.user_id]));
      } else {
        toast(msg || "Could not send cheer.", "error");
      }
    } finally {
      setCheeringSent(null);
    }
  }

  function handleDecline(connectionId: string) {
    Alert.alert("Decline Request", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
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
        },
      },
    ]);
  }

  const localToday = todayStr();
  const activeChallenges = challenges.filter((c) => c.end_date >= localToday);

  // Improvement 3: merged activity items
  type MergedActivityItem = {
    key: string;
    user_id: string;
    display_name: string;
    text: string;
    icon: string;
    occurred_at: string | null;
    isMilestone: boolean;
    activityType?: FriendActivity["activity_type"];
  };

  const mergedActivity: MergedActivityItem[] = [
    ...friendActivity.map(a => ({
      key: a.id,
      user_id: a.user_id,
      display_name: a.display_name,
      text: a.description,
      icon: '',
      occurred_at: a.occurred_at,
      isMilestone: false,
      activityType: a.activity_type,
    })),
    ...activityFeed.flatMap(entry =>
      entry.milestones.map(m => ({
        key: `${entry.user_id}-${m.type}`,
        user_id: entry.user_id,
        display_name: entry.display_name,
        text: `${m.count}d ${m.label}`,
        icon: '🏆',
        occurred_at: null,
        isMilestone: true,
      }))
    ),
  ]
    .sort((a, b) => {
      if (!a.occurred_at) return 1;
      if (!b.occurred_at) return -1;
      return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
    })
    .slice(0, 12);

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
    <ScreenBackground pageId="friends" />
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: "transparent" }}
      contentContainerStyle={[styles.content, tourPadding > 0 && { paddingBottom: tourPadding }]}
      onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); setReloadKey((k) => k + 1); }}
          tintColor={theme.teal.solid}
          colors={[theme.teal.solid]}
        />
      }
    >
      {/* Load-error banner (partial failure; full failure shows in the friends section) */}
      {!loading && loadError && friends.length > 0 && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 8 }]}>
          <Ionicons name="cloud-offline-outline" size={16} color={theme.textSoft} />
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, flex: 1 }}>
            Some of your friends data couldn't be loaded.
          </Text>
          <Pressable
            onPress={() => setReloadKey((k) => k + 1)}
            style={[styles.smallBtn, { backgroundColor: theme.card, borderColor: theme.ink }]}
          >
            <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Improvement 7: Unified inbox tray (replaces separate nudge + cheer banners) */}
      {(nudges.length > 0 || cheers.length > 0) && (
        <Pressable
          onPress={() => setInboxExpanded(v => !v)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          accessibilityRole="button"
        >
          <SectionLabel text={`Inbox (${nudges.length + cheers.length})`} style={{ marginBottom: 0 }} />
          <Ionicons name={inboxExpanded ? "chevron-up" : "chevron-down"} size={16} color={theme.textSoft} />
        </Pressable>
      )}
      {inboxExpanded && (nudges.length > 0 || cheers.length > 0) && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {nudges.map((n, i) => (
            <View key={i} style={[styles.friendRow, { borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.cardBorder }]}>
              <View style={[styles.avatarCircle, { backgroundColor: theme.teal.tint }]}>
                <Text style={{ fontSize: 16 }}>👋</Text>
              </View>
              <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: FONT_SIZES.body, flex: 1 }}>
                {n.display_name} nudged you
              </Text>
            </View>
          ))}
          {cheers.map((c, i) => (
            <View key={i} style={[styles.friendRow, { borderTopWidth: 1, borderTopColor: theme.cardBorder }]}>
              <View style={[styles.avatarCircle, { backgroundColor: theme.teal.tint }]}>
                <Text style={{ fontSize: 16 }}>🔥</Text>
              </View>
              <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: FONT_SIZES.body, flex: 1 }}>
                {c.display_name} cheered your streak
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Social notification prefs banner (settings warning, kept separate) */}
      {socialNotifPrefs && Object.values(socialNotifPrefs).some(v => !v) && (
        <View style={[styles.card, { backgroundColor: theme.amber.tint, borderColor: theme.amber.solid, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 8 }]}>
          <Ionicons name="notifications-off-outline" size={16} color={theme.amber.fg} />
          <Text style={{ color: theme.amber.fg, fontSize: FONT_SIZES.label, flex: 1, fontWeight: "600" }}>
            Some social notifications are turned off.
          </Text>
          <Pressable
            onPress={() => navigation.navigate("SettingsSocial")}
            style={[styles.smallBtn, { borderColor: theme.ink, backgroundColor: theme.card }]}
          >
            <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Review</Text>
          </Pressable>
        </View>
      )}

      {/* My Username */}
      <SectionLabel text="My Username" />
      <View ref={usernameRef}>
      <ShadowCard padding={14}>
        {username && !editingUsername ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontWeight: "700", letterSpacing: 0.4, marginBottom: 4 }}>
                YOUR USERNAME
              </Text>
              <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.heading, fontWeight: "800", lineHeight: 24 }}>
                @{username}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, marginTop: 5, lineHeight: 17 }}>
                Friends can find you using this name.
              </Text>
            </View>
            <Pressable
              onPress={() => { setEditingUsername(true); setUsernameInput(username); }}
              style={[styles.smallBtn, { borderColor: theme.ink, backgroundColor: theme.card }]}
            >
              <Ionicons name="pencil-outline" size={14} color={theme.textStrong} />
              <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.label, fontWeight: "700", marginLeft: 4 }}>Edit</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {!username && !editingUsername && (
              <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, marginBottom: 4 }}>
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
      <SectionLabel text="Add a Friend" />
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

      {/* Improvement 6: Elevated invite CTA — always shown below Add a Friend */}
      <Pressable
        onPress={handleInviteFriend}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: theme.cardBorder, backgroundColor: theme.card }}
        accessibilityRole="button"
      >
        <Ionicons name="share-outline" size={16} color={theme.teal.solid} />
        <Text style={{ color: theme.teal.solid, fontWeight: "700", fontSize: FONT_SIZES.body }}>Invite a friend to Ripple</Text>
      </Pressable>

      {/* Friend Requests */}
      {requests.length > 0 && (
        <>
          <SectionLabel text={`Friend Requests (${requests.length})`} />
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {requests.map((req, i) => (
              <View key={req.connection_id}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                <View style={styles.requestRow}>
                  {/* Improvement 1: colored initial avatar for requests */}
                  <View style={[styles.avatarCircle, { backgroundColor: avatarColor(req.from_email ?? '?', theme).bg }]}>
                    <Text style={{ color: avatarColor(req.from_email ?? '?', theme).fg, fontWeight: "800", fontSize: 15 }}>
                      {(req.from_username ?? req.from_email ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: FONT_SIZES.body, lineHeight: 19 }}>
                      {req.from_username ? "@" + req.from_username : req.from_email}
                    </Text>
                    {req.from_username && (
                      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, marginTop: 2 }}>{req.from_email}</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={() => handleAccept(req.connection_id)}
                    disabled={actingOnRequest === req.connection_id}
                    style={[styles.smallBtn, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
                  >
                    <Text style={{ color: theme.teal.fg, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDecline(req.connection_id)}
                    disabled={actingOnRequest === req.connection_id}
                    style={[styles.smallBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  >
                    <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, fontWeight: "600" }}>Decline</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* My Friends */}
      <SectionLabel text="My Friends" />
      {loading ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, alignItems: "center", paddingVertical: 20 }]}>
          <ActivityIndicator color={theme.teal.bar} />
        </View>
      ) : friends.length === 0 && loadError ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, alignItems: "center", paddingVertical: 20, paddingHorizontal: 14, gap: 10 }]}>
          <Ionicons name="cloud-offline-outline" size={24} color={theme.textSoft} />
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, textAlign: "center" }}>
            Couldn't load your friends. Check your connection and try again.
          </Text>
          <Pressable
            onPress={() => setReloadKey((k) => k + 1)}
            style={[styles.smallBtn, { backgroundColor: theme.card, borderColor: theme.ink }]}
          >
            <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.label, fontWeight: "700" }}>Retry</Text>
          </Pressable>
        </View>
      ) : friends.length === 0 ? (
        <FriendsEmptyState onPress={handleInviteFriend} />
      ) : (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {friends.map((friend, i) => {
            // Improvement 1: colored initial avatar
            const av = avatarColor(friend.user_id ?? friend.email ?? '?', theme);
            return (
              <View key={friend.connection_id}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                <View style={styles.friendRow}>
                  <View style={[styles.avatarCircle, { backgroundColor: av.bg }]}>
                    <Text style={{ color: av.fg, fontWeight: "800", fontSize: 15 }}>{getInitial(friend)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: FONT_SIZES.body, lineHeight: 19 }}>
                      {friend.username ? "@" + friend.username : friend.email}
                    </Text>
                    {friend.username && (
                      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, marginTop: 2 }}>{friend.email}</Text>
                    )}
                    <View style={styles.sharingRow}>
                      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginRight: 6 }}>Sharing:</Text>
                      {(["steps", "exercise", "hobbies", "books"] as SocialCategory[]).map((cat) =>
                        friend.sharing?.[cat] ? (
                          <View key={cat} style={[styles.sharingBadge, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                            <Ionicons name={CATEGORY_ICON[cat]} size={11} color={theme.teal.fg} />
                          </View>
                        ) : null
                      )}
                      {!friend.sharing?.steps && !friend.sharing?.exercise && !friend.sharing?.hobbies && !friend.sharing?.books && (
                        <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, fontStyle: "italic" }}>nothing yet</Text>
                      )}
                    </View>
                    {/* Improvement 2 / 8: last active line */}
                    {(() => {
                      const lastAct = friendActivity
                        .filter(a => a.user_id === friend.user_id)
                        .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0];
                      return lastAct ? (
                        <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginTop: 2 }}>
                          Active {timeAgo(lastAct.occurred_at)}
                        </Text>
                      ) : null;
                    })()}
                  </View>
                  <Pressable
                    onPress={() => handleNudge(friend)}
                    disabled={nudgingSent === friend.connection_id}
                    accessibilityRole="button"
                    accessibilityLabel="Send a nudge"
                    style={[styles.smallBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                  >
                    {nudgingSent === friend.connection_id ? (
                      <ActivityIndicator size="small" color={theme.teal.fg} />
                    ) : (
                      <ThemedIcon slot="social.nudge" size={16} />
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => handleCheer(friend)}
                    disabled={cheeringSent === friend.user_id || cheersSentToday.has(friend.user_id)}
                    accessibilityRole="button"
                    accessibilityLabel={cheersSentToday.has(friend.user_id) ? "Cheer sent" : "Send a cheer"}
                    style={[
                      styles.smallBtn,
                      cheersSentToday.has(friend.user_id)
                        ? { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }
                        : { backgroundColor: theme.card, borderColor: theme.cardBorder },
                    ]}
                  >
                    {cheeringSent === friend.user_id ? (
                      <ActivityIndicator size="small" color={theme.teal.fg} />
                    ) : (
                      <Ionicons
                        name={cheersSentToday.has(friend.user_id) ? "flame" : "flame-outline"}
                        size={16}
                        color={cheersSentToday.has(friend.user_id) ? theme.teal.fg : theme.textSoft}
                      />
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Improvement 3: Merged "What's Happening" section */}
      <SectionLabel text="What's Happening" />
      {loading ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {[0, 1, 2].map(i => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: theme.cardBorder }} />
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ width: "60%", height: 10, borderRadius: 5, backgroundColor: theme.cardBorder }} />
                <View style={{ width: "80%", height: 10, borderRadius: 5, backgroundColor: theme.cardBorder }} />
              </View>
            </View>
          ))}
        </View>
      ) : mergedActivity.length === 0 ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder, paddingHorizontal: 14, paddingVertical: 14 }]}>
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label }}>No recent activity from friends.</Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          {mergedActivity.map((item, i) => {
            const av = avatarColor(item.user_id ?? '?', theme);
            const initial = item.display_name ? item.display_name[0].toUpperCase() : "?";
            return (
              <View key={item.key}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                <View style={[styles.friendRow, { alignItems: "flex-start" }]}>
                  <View style={[styles.avatarCircle, { backgroundColor: av.bg }]}>
                    <Text style={{ color: av.fg, fontWeight: "800", fontSize: 15 }}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: FONT_SIZES.body }}>{item.display_name}</Text>
                      {!item.isMilestone && item.activityType && (
                        <Ionicons name={activityIcon(item.activityType)} size={13} color={theme.textSoft} />
                      )}
                      {item.isMilestone && <Text style={{ fontSize: 13 }}>{item.icon}</Text>}
                    </View>
                    <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, marginTop: 2 }}>{item.text}</Text>
                  </View>
                  {item.occurred_at ? (
                    <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption }}>{timeAgo(item.occurred_at)}</Text>
                  ) : (
                    <View style={[styles.feedBadge, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
                      <Text style={{ color: theme.teal.fg, fontSize: FONT_SIZES.caption, fontWeight: "700" }}>streak</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Improvement 4: Leaderboard cards with friend count */}
      <View ref={leaderboardRef}>
      <SectionLabel text="Leaderboards" />
      <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, marginBottom: 8, lineHeight: 18 }}>
        Only steps, exercise, hobbies, and books are compared — all other data stays private.
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {CATEGORIES.map((cat) => {
          const sharingCount = friends.filter(f => f.sharing?.[cat]).length;
          return (
            <Pressable
              key={cat}
              onPress={() => navigation.navigate("Leaderboard", { category: cat })}
              style={[styles.leaderboardCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
              <Ionicons name={CATEGORY_ICON[cat]} size={26} color={theme.teal.solid} />
              <Text style={{ fontWeight: "800", fontSize: FONT_SIZES.label, marginTop: 6, textAlign: "center", color: theme.textStrong }}>
                {CATEGORY_LABEL[cat]}
              </Text>
              {sharingCount > 0 && (
                <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginTop: 2, textAlign: "center" }}>
                  vs {sharingCount} friend{sharingCount !== 1 ? "s" : ""}
                </Text>
              )}
              <Ionicons name="chevron-forward" size={14} color={theme.textSoft} style={{ marginTop: 4 }} />
            </Pressable>
          );
        })}
      </View>
      </View>

      {/* Improvement 5: Inline active challenge cards */}
      <View ref={challengesRef}>
      <SectionLabel text="Challenges" />
      {activeChallenges.length > 0 ? (
        <>
          {activeChallenges.slice(0, 3).map((c) => {
            const daysLeft = Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86400000);
            return (
              <ShadowCard key={c.id} padding={14} accent={theme.purple.solid}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Ionicons name="trophy-outline" size={18} color={theme.purple.fg} />
                  <Text style={{ color: theme.textStrong, fontWeight: "800", fontSize: FONT_SIZES.body, flex: 1 }}>{c.name}</Text>
                  <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption }}>
                    {daysLeft > 0 ? `${daysLeft}d left` : "ends today"}
                  </Text>
                </View>
                {(c as any).description ? (
                  <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginBottom: 6 }} numberOfLines={2}>
                    {(c as any).description}
                  </Text>
                ) : null}
              </ShadowCard>
            );
          })}
          <Pressable
            onPress={() => navigation.navigate("Challenges")}
            style={{ alignItems: "center", paddingVertical: 8 }}
          >
            <Text style={{ color: theme.purple.fg, fontWeight: "700", fontSize: FONT_SIZES.label }}>See all challenges →</Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          onPress={() => navigation.navigate("Challenges")}
          style={[styles.challengeBtn, { backgroundColor: theme.purple.tint, borderColor: theme.ink }]}
        >
          <Ionicons name="trophy-outline" size={20} color={theme.purple.fg} />
          <Text style={{ color: theme.purple.fg, fontWeight: "800", fontSize: FONT_SIZES.subheading, flex: 1, marginLeft: 10 }}>
            See Challenges
          </Text>
          <Ionicons name="chevron-forward" size={18} color={theme.purple.fg} />
        </Pressable>
      )}
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
    <FeatureIntroSheet intro={friendsIntro} visible={introVisible} onClose={dismissIntro} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: {
    fontSize: FONT_SIZES.micro,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
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
    fontSize: FONT_SIZES.body,
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
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: FONT_SIZES.caption, letterSpacing: 0.4 },
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
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
