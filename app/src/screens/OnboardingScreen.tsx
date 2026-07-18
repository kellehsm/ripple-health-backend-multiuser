import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeContext";
import {
  requestNotificationPermission,
  scheduleCheckInNotifications,
} from "../services/notificationService";
import { FIXED_WINDOWS } from "../services/adaptiveTimingService";

type TimingMode = "fixed" | "adaptive";

const ONBOARDING_KEY = "ripple:onboarding_complete";
const TIMING_MODE_KEY = "ripple:notification_mode";

interface Props {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: Props) {
  const { theme } = useTheme();
  const [timingMode, setTimingMode] = useState<TimingMode>("fixed");
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequestPermission() {
    const granted = await requestNotificationPermission();
    setPermissionGranted(granted);
  }

  async function handleGetStarted() {
    setLoading(true);
    await AsyncStorage.setItem(TIMING_MODE_KEY, timingMode);
    if (permissionGranted) {
      await scheduleCheckInNotifications(FIXED_WINDOWS);
    }
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    onComplete();
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page, flex: 1 }}
      contentContainerStyle={styles.content}
    >
      <View style={styles.hero}>
        <Ionicons name="pulse" size={48} color={theme.teal.bar} />
        <Text style={[styles.title, { color: theme.textStrong }]}>Welcome to Ripple</Text>
        <Text style={[styles.subtitle, { color: theme.textSoft }]}>
          Your personal wellness dashboard
        </Text>
      </View>

      {/* Notification permission */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>
          Check-in reminders
        </Text>
        <Text style={[styles.body, { color: theme.textSoft }]}>
          Ripple can send gentle reminders to check in throughout the day —
          morning, afternoon, evening, and night.
        </Text>

        {permissionGranted === null ? (
          <Pressable
            onPress={handleRequestPermission}
            style={[styles.primaryBtn, { backgroundColor: theme.teal.bar }]}
          >
            <Text style={styles.primaryBtnText}>Allow reminders</Text>
          </Pressable>
        ) : permissionGranted ? (
          <View style={[styles.permissionBadge, { backgroundColor: theme.teal.bg }]}>
            <Ionicons name="checkmark-circle" size={16} color={theme.teal.fg} />
            <Text style={[styles.permissionText, { color: theme.teal.fg }]}>
              Reminders enabled
            </Text>
          </View>
        ) : (
          <View style={[styles.permissionBadge, { backgroundColor: theme.amber.bg }]}>
            <Ionicons name="alert-circle" size={16} color={theme.amber.fg} />
            <Text style={[styles.permissionText, { color: theme.amber.fg }]}>
              Permission not granted — you can enable this later in Settings
            </Text>
          </View>
        )}
      </View>

      {/* Timing mode choice */}
      {permissionGranted !== false && (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>
            How should check-in reminders work?
          </Text>

          <Pressable
            onPress={() => setTimingMode("fixed")}
            style={[
              styles.modeOption,
              {
                borderColor:
                  timingMode === "fixed" ? theme.teal.bar : theme.cardBorder,
                backgroundColor:
                  timingMode === "fixed" ? theme.teal.bg : "transparent",
              },
            ]}
          >
            <View style={styles.modeHeader}>
              <Ionicons
                name={timingMode === "fixed" ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={timingMode === "fixed" ? theme.teal.bar : theme.textSoft}
              />
              <Text
                style={[
                  styles.modeTitle,
                  { color: timingMode === "fixed" ? theme.teal.fg : theme.textStrong },
                ]}
              >
                Fixed times
              </Text>
            </View>
            <Text style={[styles.modeBody, { color: theme.textSoft }]}>
              Reminders at consistent times: morning, afternoon, evening, and night.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTimingMode("adaptive")}
            style={[
              styles.modeOption,
              {
                borderColor:
                  timingMode === "adaptive" ? theme.teal.bar : theme.cardBorder,
                backgroundColor:
                  timingMode === "adaptive" ? theme.teal.bg : "transparent",
              },
            ]}
          >
            <View style={styles.modeHeader}>
              <Ionicons
                name={timingMode === "adaptive" ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={timingMode === "adaptive" ? theme.teal.bar : theme.textSoft}
              />
              <Text
                style={[
                  styles.modeTitle,
                  { color: timingMode === "adaptive" ? theme.teal.fg : theme.textStrong },
                ]}
              >
                Adaptive
              </Text>
            </View>
            <Text style={[styles.modeBody, { color: theme.textSoft }]}>
              Learns your routine and adjusts to when you actually use the app. Takes
              a couple of weeks to personalise — uses fixed times until then.
            </Text>
          </Pressable>

          <Text style={[styles.hint, { color: theme.textSoft }]}>
            You can change this any time in Settings → Notifications.
          </Text>
        </View>
      )}

      {/* Get started */}
      <Pressable
        onPress={handleGetStarted}
        disabled={loading}
        style={[
          styles.primaryBtn,
          { backgroundColor: theme.teal.bar, opacity: loading ? 0.6 : 1 },
        ]}
      >
        <Text style={styles.primaryBtnText}>Get started</Text>
      </Pressable>

      {permissionGranted === null && (
        <Pressable onPress={handleGetStarted} disabled={loading}>
          <Text style={[styles.skipText, { color: theme.textSoft }]}>
            Skip notifications for now
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, gap: 16, paddingTop: 60 },
  hero: { alignItems: "center", gap: 8, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 15, textAlign: "center" },
  card: { borderRadius: 16, borderWidth: 0.5, padding: 18, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 14, lineHeight: 20 },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  permissionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: 10,
  },
  permissionText: { fontSize: 13, flex: 1 },
  modeOption: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    gap: 6,
  },
  modeHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  modeTitle: { fontSize: 15, fontWeight: "600" },
  modeBody: { fontSize: 13, lineHeight: 18, paddingLeft: 30 },
  hint: { fontSize: 12, textAlign: "center" },
  skipText: { fontSize: 14, textAlign: "center", textDecorationLine: "underline" },
});
