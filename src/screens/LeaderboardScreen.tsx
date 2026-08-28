import React, { useCallback, useState } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  RefreshControl,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES, SPACING } from "../theme/tokens";
import { ShadowCard } from "../components/ShadowCard";
import { ScreenBackground } from "../components/ScreenBackground";
import { getLeaderboard, getReactions, addReaction, LeaderboardEntry, Reaction, SocialCategory } from "../api/friends";
import { toast } from "../lib/toast";
import { getWeekStart } from "../utils/dateUtils";
import { RANK_COLORS } from "../constants";

const CATEGORY_ICON: Record<SocialCategory, keyof typeof Ionicons.glyphMap> = {
  steps: "footsteps-outline",
  exercise: "barbell-outline",
  hobbies: "star-outline",
  books: "book-outline",
};

const CATEGORY_LABEL: Record<SocialCategory, string> = {
  steps: "Steps This Week",
  exercise: "Exercise This Week",
  hobbies: "Hobbies This Week",
  books: "Books This Month",
};

function formatValue(value: number, category: SocialCategory): string {
  if (category === "steps") {
    return value.toLocaleString() + " steps";
  }
  if (category === "exercise") {
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (h === 0) return m + " min";
    if (m === 0) return h + "h";
    return h + "h " + m + "m";
  }
  if (category === "hobbies") {
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (h === 0) return m + " min";
    if (m === 0) return h + "h";
    return h + "h " + m + "m";
  }
  if (category === "books") {
    return value + (value === 1 ? " book" : " books");
  }
  return String(value);
}

const RANK_MEDALS = ["", "gold", "silver", "bronze"] as const;
const REACTION_EMOJIS = ["🔥", "💪", "👏", "⭐", "🚀"] as const;

export function LeaderboardScreen() {
  const { theme } = useTheme();
  const route = useRoute<any>();
  const category: SocialCategory = route.params?.category ?? "steps";

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<LeaderboardEntry | null>(null);

  const fetchData = useCallback(
    (isCancelled?: () => boolean) => {
      const weekStart = getWeekStart();
      return Promise.all([
        getLeaderboard(category),
        getReactions(category, weekStart).catch(() => []),
      ]).then(([data, rxns]) => {
        if (isCancelled?.()) return;
        const entryList = Array.isArray(data) ? data : [];
        setEntries(entryList);
        setReactions(Array.isArray(rxns) ? rxns : []);
        const me = entryList.find((e) => e.is_me);
        setMyUserId(me ? me.user_id : null);
        setLoadError(false);
      }).catch(() => {
        if (!isCancelled?.()) setLoadError(true);
      });
    },
    [category]
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setLoadError(false);
      fetchData(() => cancelled).finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => { cancelled = true; };
    }, [fetchData])
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAddReaction(entry: LeaderboardEntry, emoji: string) {
    setPickerTarget(null);
    try {
      await addReaction({ to_user_id: entry.user_id, category, emoji, week_start: getWeekStart() });
      // Only insert optimistically when we know our own user id (i.e. we appear
      // in this leaderboard). Otherwise the reaction shows on next refresh.
      if (myUserId) {
        setReactions((prev) => {
          const filtered = prev.filter(
            (r) => !(r.from_user_id === myUserId && r.to_user_id === entry.user_id)
          );
          return [...filtered, { from_user_id: myUserId, to_user_id: entry.user_id, emoji }];
        });
      }
    } catch {
      toast("Could not add reaction.", "error");
    }
  }

  const myEntry = entries.find((e) => e.is_me);

  const listHeader = (
    <>
      {/* Header card */}
      <ShadowCard padding={16} bg={theme.teal.tint} accent={theme.teal.solid}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name={CATEGORY_ICON[category]} size={28} color={theme.teal.fg} />
          <View>
            <Text style={{ color: theme.teal.fg, fontSize: FONT_SIZES.title, fontWeight: "900", lineHeight: 26 }}>
              {CATEGORY_LABEL[category]}
            </Text>
            <Text style={{ color: theme.teal.sub, fontSize: FONT_SIZES.label, marginTop: SPACING.xs, lineHeight: 17 }}>
              Compared with your friends
            </Text>
          </View>
        </View>
        {myEntry && (
          <View style={[styles.myBanner, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: FONT_SIZES.label, lineHeight: 18 }}>
              Your position: #{myEntry.rank} — {formatValue(myEntry.value, category)}
            </Text>
          </View>
        )}
      </ShadowCard>

      {/* Privacy note */}
      <View style={[styles.privacyNote, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Ionicons name="shield-checkmark-outline" size={14} color={theme.textSoft} style={{ marginRight: 6 }} />
        <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, flex: 1, lineHeight: 16 }}>
          Only data each person has chosen to share is visible here. All other health data stays completely private.
        </Text>
      </View>

      {/* Leaderboard non-list states */}
      {loading ? (
        <View style={{ gap: 10 }}>
          <ShadowCard skeleton skeletonHeight={68} />
          <ShadowCard skeleton skeletonHeight={68} />
          <ShadowCard skeleton skeletonHeight={68} />
          <ShadowCard skeleton skeletonHeight={68} />
          <ShadowCard skeleton skeletonHeight={68} />
        </View>
      ) : loadError ? (
        <ShadowCard padding={20}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <Ionicons name="cloud-offline-outline" size={36} color={theme.textSoft} />
            <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.subheading, fontWeight: "800", textAlign: "center" }}>
              Couldn't load the leaderboard
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, textAlign: "center", lineHeight: 19 }}>
              Check your connection, then pull down to refresh or tap retry.
            </Text>
            <Pressable
              onPress={() => {
                setLoading(true);
                fetchData().finally(() => setLoading(false));
              }}
              style={{ borderWidth: 2, borderColor: theme.cardBorder, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 8, backgroundColor: theme.card }}
            >
              <Text style={{ color: theme.textStrong, fontWeight: "800", fontSize: FONT_SIZES.label }}>Retry</Text>
            </Pressable>
          </View>
        </ShadowCard>
      ) : entries.length < 2 ? (
        <ShadowCard padding={20}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <Ionicons name="people-outline" size={40} color={theme.teal.solid} />
            <Text style={{ color: theme.textStrong, fontSize: FONT_SIZES.heading, fontWeight: "800", textAlign: "center", lineHeight: 23 }}>
              Invite friends to compare!
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, textAlign: "center", lineHeight: 19 }}>
              You need at least two people with shared data to see a leaderboard. Add friends from the Friends tab.
            </Text>
          </View>
        </ShadowCard>
      ) : (
        <View style={[styles.board, { backgroundColor: theme.card, borderColor: theme.cardBorder }]} />
      )}
    </>
  );

  const listFooter = (
    <>
      {/* Encouraging note */}
      {entries.length >= 2 && (
        <View style={[styles.encourageNote, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, textAlign: "center", lineHeight: 18 }}>
            Keep it up — every bit of progress counts. The goal is to stay active together, not to race.
          </Text>
        </View>
      )}

      {/* Emoji picker modal */}
      <Modal
        visible={pickerTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerTarget(null)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setPickerTarget(null)}>
          <View style={[styles.emojiPicker, { backgroundColor: theme.card, borderColor: theme.ink }]}>
            <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.label, fontWeight: "700", marginBottom: SPACING.sm, letterSpacing: 0.4 }}>
              REACT TO {(pickerTarget?.display_name ?? "").toUpperCase()}
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable key={emoji} onPress={() => { if (pickerTarget) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleAddReaction(pickerTarget, emoji); } }}>
                  <Text style={{ fontSize: 30 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );

  const renderEntry = useCallback(({ item: entry, index: i }: { item: LeaderboardEntry; index: number }) => {
    const isTop3 = entry.rank <= 3;
    const medalColor = RANK_COLORS[entry.rank] ?? theme.textSoft;
    const entryReactions = reactions.filter((r) => r.to_user_id === entry.user_id);
    const myReaction = reactions.find((r) => r.to_user_id === entry.user_id && r.from_user_id === myUserId);
    return (
      <View style={[styles.board, { backgroundColor: theme.card, borderColor: theme.cardBorder, borderRadius: 0, borderWidth: 0 }]}>
        {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
        <Pressable
          onPress={() => { if (!entry.is_me) { Haptics.selectionAsync(); setPickerTarget(entry); } }}
          style={[
            styles.entryRow,
            entry.is_me && { backgroundColor: theme.teal.tint },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Rank ${entry.rank}, ${entry.display_name}${entry.is_me ? ", you" : ""}`}
        >
          {/* Rank */}
          <View style={[styles.rankBadge, isTop3 && { backgroundColor: medalColor + "22", borderColor: medalColor }]}>
            <Text style={{ color: isTop3 ? medalColor : theme.textSoft, fontWeight: "900", fontSize: FONT_SIZES.subheading }}>
              {entry.rank}
            </Text>
          </View>

          {/* Name + reaction pills */}
          <View style={{ flex: 1, marginLeft: SPACING.sm }}>
            <Text
              style={{
                color: theme.textStrong,
                fontSize: FONT_SIZES.subheading,
                fontWeight: entry.is_me ? "900" : "600",
                lineHeight: 20,
              }}
            >
              {entry.display_name}
              {entry.is_me ? " (you)" : ""}
            </Text>
            {entryReactions.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {entryReactions.map((r, j) => (
                  <View key={j} style={[styles.reactionPill, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
                    <Text style={{ fontSize: FONT_SIZES.label }}>{r.emoji}</Text>
                  </View>
                ))}
                {myReaction && (
                  <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.micro, alignSelf: "center" }}>you reacted</Text>
                )}
              </View>
            )}
          </View>

          {/* Value */}
          <Text
            style={{
              color: entry.is_me ? theme.teal.fg : theme.textStrong,
              fontWeight: "800",
              fontSize: FONT_SIZES.body,
              lineHeight: 20,
            }}
          >
            {formatValue(entry.value, category)}
          </Text>
        </Pressable>
      </View>
    );
  }, [reactions, myUserId, theme, category]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.page }}>
      <ScreenBackground />
      <FlatList
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.teal.solid} />
        }
        data={!loading && !loadError && entries.length >= 2 ? entries : []}
        keyExtractor={(entry, i) => entry.user_id + String(i)}
        renderItem={renderEntry}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        ListHeaderComponentStyle={{ gap: 12 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 40 },
  myBanner: {
    marginTop: SPACING.md,
    borderRadius: 22,
    borderWidth: 2,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 22,
    padding: SPACING.sm,
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
    width: 34,
    height: 34,
    borderRadius: 17,
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
  reactionPill: {
    borderWidth: 1.5,
    borderRadius: SPACING.sm,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  emojiPicker: {
    borderRadius: 22,
    borderWidth: 2,
    padding: 20,
    alignItems: "center",
    shadowColor: "rgba(60,40,20,0.2)",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
});
