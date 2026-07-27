import React, { useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  Switch,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { toast } from "../../lib/toast";
import {
  getSharingPrefs,
  updateSharingPrefs,
  getSocialNotifPrefs,
  updateSocialNotifPrefs,
  SharingPrefs,
  SocialNotifPrefs,
} from "../../api/friends";

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
  theme,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  theme: any;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "600" }}>{label}</Text>
        {sublabel ? (
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>{sublabel}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.cardBorder, true: theme.teal.bar }}
        thumbColor="#fff"
      />
    </View>
  );
}

export function SocialSettingsScreen() {
  const { theme } = useTheme();

  const [sharing, setSharing] = useState<SharingPrefs>({
    steps: false,
    exercise: false,
    hobbies: false,
    books: false,
  });
  const [notifs, setNotifs] = useState<SocialNotifPrefs>({
    friend_request: true,
    friend_accepted: true,
    challenge_invite: true,
    challenge_update: false,
    leaderboard_milestone: false,
  });
  const [loadingSharing, setLoadingSharing] = useState(true);
  const [loadingNotifs, setLoadingNotifs] = useState(true);
  const [savingSharing, setSavingSharing] = useState(false);
  const [savingNotifs, setSavingNotifs] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSharingPrefs()
        .then((data) => { if (!cancelled && data) setSharing(data); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoadingSharing(false); });
      getSocialNotifPrefs()
        .then((data) => { if (!cancelled && data) setNotifs(data); })
        .catch(() => {})
        .finally(() => { if (!cancelled) setLoadingNotifs(false); });
      return () => { cancelled = true; };
    }, [])
  );

  async function patchSharing(patch: Partial<SharingPrefs>) {
    const merged = { ...sharing, ...patch };
    setSharing(merged);
    setSavingSharing(true);
    try {
      await updateSharingPrefs(merged);
    } catch (e: any) {
      toast(e?.message ?? "Could not save sharing preferences.", "error");
      // Roll back
      setSharing(sharing);
    } finally {
      setSavingSharing(false);
    }
  }

  async function patchNotifs(patch: Partial<SocialNotifPrefs>) {
    const merged = { ...notifs, ...patch };
    setNotifs(merged);
    setSavingNotifs(true);
    try {
      await updateSocialNotifPrefs(merged);
    } catch (e: any) {
      toast(e?.message ?? "Could not save notification preferences.", "error");
      setNotifs(notifs);
    } finally {
      setSavingNotifs(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* Privacy banner */}
      <View style={[styles.privacyBanner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
        <Ionicons name="shield-checkmark-outline" size={18} color={theme.teal.fg} style={{ marginRight: 8, flexShrink: 0 }} />
        <Text style={{ color: theme.teal.fg, fontSize: 13, flex: 1, lineHeight: 19 }}>
          Friends can only see what you choose to share. Glucose, mood, sleep, and all other data stays completely private.
        </Text>
      </View>

      {/* Sharing prefs */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[styles.groupLabel, { color: theme.textSoft }]}>SHARE WITH FRIENDS</Text>
        {savingSharing && <ActivityIndicator size="small" color={theme.teal.bar} />}
      </View>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {loadingSharing ? (
          <ActivityIndicator color={theme.teal.bar} style={{ paddingVertical: 12 }} />
        ) : (
          <>
            <ToggleRow
              label="Steps"
              sublabel="Weekly step count visible to friends"
              value={sharing.steps}
              onChange={(v) => patchSharing({ steps: v })}
              theme={theme}
            />
            <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            <ToggleRow
              label="Exercise"
              sublabel="Weekly workout time visible to friends"
              value={sharing.exercise}
              onChange={(v) => patchSharing({ exercise: v })}
              theme={theme}
            />
            <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            <ToggleRow
              label="Hobbies"
              sublabel="Weekly hobby time visible to friends"
              value={sharing.hobbies}
              onChange={(v) => patchSharing({ hobbies: v })}
              theme={theme}
            />
            <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            <ToggleRow
              label="Books"
              sublabel="Monthly books read visible to friends"
              value={sharing.books}
              onChange={(v) => patchSharing({ books: v })}
              theme={theme}
            />
          </>
        )}
      </View>

      <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: -4, marginBottom: 4, paddingHorizontal: 2 }}>
        Only the categories you enable appear on leaderboards and in challenges. Nothing else is ever shared.
      </Text>

      {/* Notification prefs */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={[styles.groupLabel, { color: theme.textSoft }]}>SOCIAL NOTIFICATIONS</Text>
        {savingNotifs && <ActivityIndicator size="small" color={theme.teal.bar} />}
      </View>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {loadingNotifs ? (
          <ActivityIndicator color={theme.teal.bar} style={{ paddingVertical: 12 }} />
        ) : (
          <>
            <ToggleRow
              label="Friend requests"
              sublabel="When someone sends you a friend request"
              value={notifs.friend_request}
              onChange={(v) => patchNotifs({ friend_request: v })}
              theme={theme}
            />
            <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            <ToggleRow
              label="Request accepted"
              sublabel="When a friend accepts your request"
              value={notifs.friend_accepted}
              onChange={(v) => patchNotifs({ friend_accepted: v })}
              theme={theme}
            />
            <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            <ToggleRow
              label="Challenge invites"
              sublabel="When a friend invites you to a challenge"
              value={notifs.challenge_invite}
              onChange={(v) => patchNotifs({ challenge_invite: v })}
              theme={theme}
            />
            <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            <ToggleRow
              label="Challenge updates"
              sublabel="Milestones and progress updates in challenges"
              value={notifs.challenge_update}
              onChange={(v) => patchNotifs({ challenge_update: v })}
              theme={theme}
            />
            <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            <ToggleRow
              label="Leaderboard milestones"
              sublabel="When you reach a new rank on a leaderboard"
              value={notifs.leaderboard_milestone}
              onChange={(v) => patchNotifs({ leaderboard_milestone: v })}
              theme={theme}
            />
          </>
        )}
      </View>
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
  privacyBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 2,
    borderRadius: 18,
    padding: 14,
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  divider: { height: 1, marginHorizontal: 16 },
});
