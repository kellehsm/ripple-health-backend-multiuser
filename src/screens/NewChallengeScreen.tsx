import React, { useCallback, useState } from "react";
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { ShadowCard } from "../components/ShadowCard";
import { toast } from "../lib/toast";
import { createChallenge, getFriends, Friend, SocialCategory } from "../api/friends";

const CATEGORIES: { id: SocialCategory; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: "steps",    label: "Steps",    icon: "footsteps-outline" },
  { id: "exercise", label: "Exercise", icon: "barbell-outline" },
  { id: "hobbies",  label: "Hobbies",  icon: "star-outline" },
  { id: "books",    label: "Books",    icon: "book-outline" },
];

function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function NewChallengeScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const today = new Date();
  const defaultEnd = addDays(today, 7);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<SocialCategory>("steps");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalValue, setGoalValue] = useState("");
  const [startDate, setStartDate] = useState(formatDateLocal(today));
  const [endDate, setEndDate] = useState(formatDateLocal(defaultEnd));
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getFriends()
        .then((data) => { if (!cancelled) setFriends(Array.isArray(data) ? data : []); })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [])
  );

  function toggleFriend(userId: string) {
    setSelectedFriends((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  async function handleSubmit() {
    if (!title.trim()) { toast("Please enter a title.", "error"); return; }
    if (!goalDescription.trim()) { toast("Please describe the goal.", "error"); return; }
    if (!startDate || !endDate) { toast("Please set start and end dates.", "error"); return; }
    if (endDate < startDate) { toast("End date must be after start date.", "error"); return; }

    setSubmitting(true);
    try {
      await createChallenge({
        title: title.trim(),
        category,
        goal_description: goalDescription.trim(),
        goal_value: goalValue ? parseFloat(goalValue) : null,
        start_date: startDate,
        end_date: endDate,
        invite_user_ids: selectedFriends,
      });
      toast("Challenge created!");
      navigation.goBack();
    } catch (e: any) {
      toast(e?.message ?? "Could not create challenge.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Privacy note */}
      <View style={[styles.privacyNote, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
        <Ionicons name="shield-checkmark-outline" size={14} color={theme.teal.fg} style={{ marginRight: 6 }} />
        <Text style={{ color: theme.teal.fg, fontSize: 12, flex: 1, fontWeight: "600" }}>
          Challenges are limited to steps, exercise, hobbies, and books. All other health data stays private.
        </Text>
      </View>

      {/* Title */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>CHALLENGE TITLE</Text>
      <ShadowCard padding={14}>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. 10K steps a day for a week"
          placeholderTextColor={theme.textSoft}
          style={[styles.textInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card }]}
          maxLength={80}
        />
      </ShadowCard>

      {/* Category */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>CATEGORY</Text>
      <ShadowCard padding={14}>
        <View style={styles.catRow}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => setCategory(cat.id)}
              style={[
                styles.catBtn,
                {
                  backgroundColor: category === cat.id ? theme.teal.solid : theme.card,
                  borderColor: category === cat.id ? theme.ink : theme.cardBorder,
                },
              ]}
            >
              <Ionicons
                name={cat.icon}
                size={18}
                color={category === cat.id ? "#fff" : theme.textSoft}
              />
              <Text style={{ color: category === cat.id ? "#fff" : theme.textStrong, fontWeight: "700", fontSize: 12, marginTop: 4, textAlign: "center" }}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </ShadowCard>

      {/* Goal description */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>GOAL DESCRIPTION</Text>
      <ShadowCard padding={14}>
        <TextInput
          value={goalDescription}
          onChangeText={setGoalDescription}
          placeholder="e.g. Walk 10,000 steps every day"
          placeholderTextColor={theme.textSoft}
          style={[styles.textInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card }]}
          maxLength={200}
          multiline
        />
      </ShadowCard>

      {/* Goal value (optional) */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>GOAL VALUE (OPTIONAL)</Text>
      <ShadowCard padding={14}>
        <TextInput
          value={goalValue}
          onChangeText={setGoalValue}
          placeholder={
            category === "steps" ? "e.g. 70000"
              : category === "exercise" ? "e.g. 300 (minutes)"
              : category === "hobbies" ? "e.g. 420 (minutes)"
              : "e.g. 2 (books)"
          }
          placeholderTextColor={theme.textSoft}
          keyboardType="numeric"
          style={[styles.textInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card }]}
        />
        <Text style={{ color: theme.textSoft, fontSize: 11, marginTop: 6 }}>
          Leave blank if the goal is qualitative rather than a specific number.
        </Text>
      </ShadowCard>

      {/* Dates */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>DATE RANGE</Text>
      <ShadowCard padding={14}>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>START DATE</Text>
            <TextInput
              value={startDate}
              onChangeText={setStartDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSoft}
              style={[styles.textInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card }]}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textSoft, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>END DATE</Text>
            <TextInput
              value={endDate}
              onChangeText={setEndDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSoft}
              style={[styles.textInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card }]}
            />
          </View>
        </View>
        {/* Quick duration chips */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {[
            { label: "1 week", days: 7 },
            { label: "2 weeks", days: 14 },
            { label: "1 month", days: 30 },
          ].map((opt) => (
            <Pressable
              key={opt.label}
              onPress={() => {
                const s = new Date(startDate || formatDateLocal(today));
                setEndDate(formatDateLocal(addDays(s, opt.days)));
              }}
              style={[styles.chip, { borderColor: theme.ink, backgroundColor: theme.card }]}
            >
              <Text style={{ color: theme.textStrong, fontSize: 12, fontWeight: "700" }}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </ShadowCard>

      {/* Invite friends */}
      {friends.length > 0 && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>INVITE FRIENDS</Text>
          <ShadowCard padding={14}>
            <Text style={{ color: theme.textSoft, fontSize: 12, marginBottom: 8 }}>
              Select friends to invite. They can also join using the challenge link.
            </Text>
            {friends.map((friend) => {
              const selected = selectedFriends.includes(friend.user_id);
              return (
                <Pressable
                  key={friend.user_id}
                  onPress={() => toggleFriend(friend.user_id)}
                  style={[
                    styles.friendRow,
                    {
                      backgroundColor: selected ? theme.teal.tint : theme.card,
                      borderColor: selected ? theme.teal.solid : theme.cardBorder,
                    },
                  ]}
                >
                  <View style={styles.avatarCircle}>
                    <Ionicons name="person-outline" size={16} color={theme.teal.fg} />
                  </View>
                  <Text style={{ flex: 1, color: theme.textStrong, fontWeight: "600", marginLeft: 8 }}>
                    {friend.username ? "@" + friend.username : friend.email}
                  </Text>
                  {selected && <Ionicons name="checkmark-circle" size={20} color={theme.teal.solid} />}
                </Pressable>
              );
            })}
          </ShadowCard>
        </>
      )}

      {/* Submit */}
      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={[styles.submitBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16, letterSpacing: 0.3 }}>
            Create Challenge
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
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 14,
    padding: 10,
  },
  textInput: {
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  catRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  catBtn: {
    flex: 1,
    minWidth: 70,
    borderWidth: 2,
    borderRadius: 16,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dateRow: { flexDirection: "row", gap: 10 },
  chip: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 14,
    padding: 10,
    marginBottom: 6,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtn: {
    borderWidth: 2,
    borderRadius: 22,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "rgba(60,40,20,0.15)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
});
