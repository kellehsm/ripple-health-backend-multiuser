import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
  SafeAreaView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { setUsername, updateSharingPrefs } from "../api/friends";
import { toast } from "../lib/toast";
import AsyncStorage from "@react-native-async-storage/async-storage";

const FRIENDS_ONBOARDING_KEY = "friends_onboarding_done";

export async function markFriendsOnboardingDone() {
  await AsyncStorage.setItem(FRIENDS_ONBOARDING_KEY, "1");
}

export async function hasDoneFriendsOnboarding(): Promise<boolean> {
  const val = await AsyncStorage.getItem(FRIENDS_ONBOARDING_KEY);
  return val === "1";
}

const STEPS = ["welcome", "username", "sharing", "addfriend", "done"] as const;
type Step = (typeof STEPS)[number];

const SHARE_CATEGORIES = [
  { key: "share_steps",    label: "Steps",    icon: "footsteps-outline" as const,  desc: "Weekly step totals" },
  { key: "share_exercise", label: "Exercise", icon: "barbell-outline" as const,    desc: "Workout sessions & active time" },
  { key: "share_hobbies",  label: "Hobbies",  icon: "star-outline" as const,       desc: "Hobby session counts" },
  { key: "share_books",    label: "Books",    icon: "book-outline" as const,        desc: "Books finished & currently reading" },
];

export function FriendsOnboardingScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();

  const [step, setStep] = useState<Step>("welcome");
  const [usernameInput, setUsernameInput] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameSet, setUsernameSet] = useState(false);

  const [sharing, setSharing] = useState({
    share_steps: false,
    share_exercise: false,
    share_hobbies: false,
    share_books: false,
  });
  const [savingSharing, setSavingSharing] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const totalDots = STEPS.length;

  async function handleSaveUsername() {
    const trimmed = usernameInput.trim();
    if (!trimmed) { next(); return; }
    setSavingUsername(true);
    try {
      await setUsername(trimmed);
      setUsernameSet(true);
      next();
    } catch (e: any) {
      toast(e?.message ?? "Could not save username.", "error");
    } finally {
      setSavingUsername(false);
    }
  }

  async function handleSaveSharing() {
    setSavingSharing(true);
    try {
      await updateSharingPrefs(sharing);
      next();
    } catch {
      next(); // non-fatal — they can change this in settings
    } finally {
      setSavingSharing(false);
    }
  }

  function next() {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  }

  async function finish() {
    await markFriendsOnboardingDone();
    navigation.replace("Friends");
  }

  const s = styles(theme);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.page }}>
      {/* Dots */}
      <View style={s.dots}>
        {STEPS.map((_, i) => (
          <View
            key={i}
            style={[s.dot, { backgroundColor: i <= stepIndex ? theme.teal.solid : theme.cardBorder }]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {step === "welcome" && (
          <View style={s.centeredStep}>
            <View style={[s.iconCircle, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
              <Ionicons name="people" size={48} color={theme.teal.fg} />
            </View>
            <Text style={[s.title, { color: theme.textStrong }]}>Friends</Text>
            <Text style={[s.subtitle, { color: theme.textSoft }]}>
              Compare steps, books, hobbies, and exercise with friends — and challenge each other to reach goals.
            </Text>
            <View style={[s.privacyBox, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <Ionicons name="lock-closed-outline" size={16} color={theme.textSoft} style={{ marginTop: 2 }} />
              <Text style={{ color: theme.textSoft, fontSize: 13, flex: 1, lineHeight: 19 }}>
                Only steps, exercise, hobbies, and books are ever shared. Your glucose, mood, sleep, finance, and all other data stays completely private — always.
              </Text>
            </View>
            <Pressable style={[s.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink }]} onPress={next}>
              <Text style={s.primaryBtnText}>Get Started</Text>
            </Pressable>
          </View>
        )}

        {step === "username" && (
          <View style={s.centeredStep}>
            <View style={[s.iconCircle, { backgroundColor: theme.purple.tint, borderColor: theme.purple.solid ?? theme.ink }]}>
              <Ionicons name="at" size={40} color={theme.purple.fg} />
            </View>
            <Text style={[s.title, { color: theme.textStrong }]}>Choose a Username</Text>
            <Text style={[s.subtitle, { color: theme.textSoft }]}>
              Friends use your username to find and add you. You can change it anytime in settings.
            </Text>
            <TextInput
              value={usernameInput}
              onChangeText={setUsernameInput}
              placeholder="e.g. kelly_runs"
              placeholderTextColor={theme.textSoft}
              autoCapitalize="none"
              autoCorrect={false}
              style={[s.textInput, { color: theme.textStrong, borderColor: theme.ink, backgroundColor: theme.card }]}
            />
            <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4, alignSelf: "flex-start" }}>
              3–20 characters, letters/numbers/underscores only.
            </Text>
            <Pressable
              style={[s.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink, marginTop: 24 }]}
              onPress={handleSaveUsername}
              disabled={savingUsername}
            >
              {savingUsername ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>{usernameInput.trim() ? "Save & Continue" : "Skip for Now"}</Text>
              )}
            </Pressable>
          </View>
        )}

        {step === "sharing" && (
          <View style={s.step}>
            <Text style={[s.title, { color: theme.textStrong }]}>What to Share</Text>
            <Text style={[s.subtitle, { color: theme.textSoft }]}>
              Choose which categories friends can see. You can turn these on or off anytime in Settings.
            </Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {SHARE_CATEGORIES.map(({ key, label, icon, desc }) => (
                <View
                  key={key}
                  style={[s.shareRow, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
                >
                  <View style={[s.shareIcon, { backgroundColor: theme.teal.tint }]}>
                    <Ionicons name={icon} size={20} color={theme.teal.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.textStrong, fontWeight: "700", fontSize: 15 }}>{label}</Text>
                    <Text style={{ color: theme.textSoft, fontSize: 12 }}>{desc}</Text>
                  </View>
                  <Switch
                    value={sharing[key as keyof typeof sharing]}
                    onValueChange={(val) => setSharing((prev) => ({ ...prev, [key]: val }))}
                    trackColor={{ false: theme.cardBorder, true: theme.teal.solid }}
                    thumbColor="#fff"
                  />
                </View>
              ))}
            </View>
            <Pressable
              style={[s.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink, marginTop: 24 }]}
              onPress={handleSaveSharing}
              disabled={savingSharing}
            >
              {savingSharing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>Save & Continue</Text>
              )}
            </Pressable>
          </View>
        )}

        {step === "addfriend" && (
          <View style={s.centeredStep}>
            <View style={[s.iconCircle, { backgroundColor: theme.coral?.tint ?? "#FEE9E2", borderColor: theme.coral?.solid ?? theme.ink }]}>
              <Ionicons name="person-add" size={40} color={theme.coral?.fg ?? theme.ink} />
            </View>
            <Text style={[s.title, { color: theme.textStrong }]}>Add Your First Friend</Text>
            <Text style={[s.subtitle, { color: theme.textSoft }]}>
              Add friends by their email or username. You can also skip this and add friends from the Friends screen later.
            </Text>
            <Pressable
              style={[s.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink, marginTop: 16 }]}
              onPress={next}
            >
              <Text style={s.primaryBtnText}>Continue to Friends</Text>
            </Pressable>
            <Pressable onPress={next} style={{ marginTop: 12 }}>
              <Text style={{ color: theme.textSoft, fontSize: 14, textDecorationLine: "underline" }}>Skip for now</Text>
            </Pressable>
          </View>
        )}

        {step === "done" && (
          <View style={s.centeredStep}>
            <View style={[s.iconCircle, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}>
              <Ionicons name="checkmark-circle" size={48} color={theme.teal.solid} />
            </View>
            <Text style={[s.title, { color: theme.textStrong }]}>You're all set!</Text>
            <Text style={[s.subtitle, { color: theme.textSoft }]}>
              Head to the Friends screen to add friends, view leaderboards, and create challenges.
            </Text>
            <Pressable
              style={[s.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: theme.ink, marginTop: 24 }]}
              onPress={finish}
            >
              <Text style={s.primaryBtnText}>Open Friends</Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = (theme: any) =>
  StyleSheet.create({
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
      paddingTop: 20,
      paddingBottom: 8,
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    content: { padding: 28, paddingBottom: 60, flexGrow: 1 },
    centeredStep: { alignItems: "center" },
    step: {},
    iconCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: "900",
      letterSpacing: -0.5,
      textAlign: "center",
      marginBottom: 12,
    },
    subtitle: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      marginBottom: 8,
    },
    privacyBox: {
      flexDirection: "row",
      gap: 10,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1.5,
      marginVertical: 20,
    },
    primaryBtn: {
      borderWidth: 2,
      borderRadius: 18,
      paddingHorizontal: 32,
      paddingVertical: 14,
      alignItems: "center",
      alignSelf: "stretch",
    },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 16, letterSpacing: 0.2 },
    textInput: {
      borderWidth: 2,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      alignSelf: "stretch",
      marginTop: 8,
    },
    shareRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1.5,
    },
    shareIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
  });
