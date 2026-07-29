import React, { useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Modal,
} from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { ShadowCard } from "../components/ShadowCard";
import { getLeaderboard, getReactions, addReaction, LeaderboardEntry, Reaction, SocialCategory } from "../api/friends";
import { toast } from "../lib/toast";
import { getWeekStartISO } from "../utils/dateUtils";
import { RANK_COLORS } from "../constants/socialConstants";

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
  const cardBg = useCardBg();
  const route = useRoute<any>();
  const category: SocialCategory = route.params?.category ?? "steps";

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<LeaderboardEntry | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      const weekStart = getWeekStartISO();
      Promise.all([
        getLeaderboard(category),
        getReactions(category, weekStart).catch(() => []),
      ]).then(([data, rxns]) => {
        if (cancelled) return;
        const entryList = Array.isArray(data) ? data : [];
        setEntries(entryList);
        setReactions(Array.isArray(rxns) ? rxns : []);
        const me = entryList.find((e) => e.is_me);
        if (me) setMyUserId(me.user_id);
      }).catch(() => {
        if (!cancelled) setEntries([]);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
      return () => { cancelled = true; };
    }, [category])
  );

  async function handleAddReaction(entry: LeaderboardEntry, emoji: string) {
    setPickerTarget(null);
    try {
      await addReaction({ to_user_id: entry.user_id, category, emoji, week_start: getWeekStartISO() });
      setReactions((prev) => {
        const filtered = prev.filter(
          (r) => !(r.from_user_id === myUserId && r.to_user_id === entry.user_id)
        );
        return [...filtered, { from_user_id: myUserId!, to_user_id: entry.user_id, emoji }];
      });
    } catch {
      toast("Could not add reaction.", "error");
    }
  }

  const myEntry = entries.find((e) => e.is_me);

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* Header card */}
      <ShadowCard padding={16} bg={theme.teal.tint} accent={theme.teal.solid}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name={CATEGORY_ICON[category]} size={28} color={theme.teal.fg} />
          <View>
            <Text style={{ color: theme.teal.fg, fontSize: 20, fontWeight: "900", lineHeight: 26 }}>
              {CATEGORY_LABEL[category]}
            </Text>
            <Text style={{ color: theme.teal.sub, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
              Compared with your friends
            </Text>
          </View>
        </View>
        {myEntry && (
          <View style={[styles.myBanner, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}>
            <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13, lineHeight: 18 }}>
              Your position: #{myEntry.rank} — {formatValue(myEntry.value, category)}
            </Text>
          </View>
        )}
      </ShadowCard>

      {/* Privacy note */}
      <View style={[styles.privacyNote, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
        <Ionicons name="shield-checkmark-outline" size={14} color={theme.textSoft} style={{ marginRight: 6 }} />
        <Text style={{ color: theme.textSoft, fontSize: 11, flex: 1, lineHeight: 16 }}>
          Only data each person has chosen to share is visible here. All other health data stays completely private.
        </Text>
      </View>

      {/* Leaderboard */}
      {loading ? (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator color={theme.teal.bar} size="large" />
        </View>
      ) : entries.length < 2 ? (
        <ShadowCard padding={20}>
          <View style={{ alignItems: "center", gap: 12 }}>
            <Ionicons name="people-outline" size={40} color={theme.teal.solid} />
            <Text style={{ color: theme.textStrong, fontSize: 17, fontWeight: "800", textAlign: "center", lineHeight: 23 }}>
              Invite friends to compare!
            </Text>
            <Text style={{ color: theme.textSoft, fontSize: 13, textAlign: "center", lineHeight: 19 }}>
              You need at least two people with shared data to see a leaderboard. Add friends from the Friends tab.
            </Text>
          </View>
        </ShadowCard>
      ) : (
        <View style={[styles.board, { backgroundColor: cardBg, borderColor: theme.ink }]}>
          {entries.map((entry, i) => {
            const isTop3 = entry.rank <= 3;
            const medalColor = RANK_COLORS[entry.rank] ?? theme.textSoft;
            const entryReactions = reactions.filter((r) => r.to_user_id === entry.user_id);
            const myReaction = reactions.find((r) => r.to_user_id === entry.user_id && r.from_user_id === myUserId);
            return (
              <View key={entry.user_id + String(i)}>
                {i > 0 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
                <Pressable
                  onPress={() => { if (!entry.is_me) setPickerTarget(entry); }}
                  style={[
                    styles.entryRow,
                    entry.is_me && { backgroundColor: theme.teal.tint },
                  ]}
                >
                  {/* Rank */}
                  <View style={[styles.rankBadge, isTop3 && { backgroundColor: medalColor + "22", borderColor: medalColor }]}>
                    <Text style={{ color: isTop3 ? medalColor : theme.textSoft, fontWeight: "900", fontSize: 15 }}>
                      {entry.rank}
                    </Text>
                  </View>

                  {/* Name + reaction pills */}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text
                      style={{
                        color: theme.textStrong,
                        fontSize: 15,
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
                          <View key={j} style={[styles.reactionPill, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
                            <Text style={{ fontSize: 13 }}>{r.emoji}</Text>
                          </View>
                        ))}
                        {myReaction && (
                          <Text style={{ color: theme.textSoft, fontSize: 10, alignSelf: "center" }}>you reacted</Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Value */}
                  <Text
                    style={{
                      color: entry.is_me ? theme.teal.fg : theme.textStrong,
                      fontWeight: "800",
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  >
                    {formatValue(entry.value, category)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
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
          <View style={[styles.emojiPicker, { backgroundColor: cardBg, borderColor: theme.ink }]}>
            <Text style={{ color: theme.textSoft, fontSize: 12, fontWeight: "700", marginBottom: 8, letterSpacing: 0.4 }}>
              REACT TO {(pickerTarget?.display_name ?? "").toUpperCase()}
            </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable key={emoji} onPress={() => pickerTarget && handleAddReaction(pickerTarget, emoji)}>
                  <Text style={{ fontSize: 30 }}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* Encouraging note */}
      {entries.length >= 2 && (
        <View style={[styles.encourageNote, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <Text style={{ color: theme.textSoft, fontSize: 12, textAlign: "center", lineHeight: 18 }}>
            Keep it up — every bit of progress counts. The goal is to stay active together, not to race.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  myBanner: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 10,
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
    borderRadius: 16,
    padding: 12,
  },
  reactionPill: {
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 6,
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
