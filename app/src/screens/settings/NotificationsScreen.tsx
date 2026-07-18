import React, { useState, useEffect, useCallback } from "react";
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Switch,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../../theme/ThemeContext";
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  scheduleCheckInNotifications,
  cancelCheckInNotifications,
} from "../../services/notificationService";
import {
  computeAdaptiveWindows,
  getAppOpenCount,
  formatTime,
  FIXED_WINDOWS,
  NotificationWindows,
} from "../../services/adaptiveTimingService";

type TimingMode = "fixed" | "adaptive";
const TIMING_MODE_KEY = "ripple:notification_mode";

export function NotificationsScreen() {
  const { theme } = useTheme();
  const [mode, setMode] = useState<TimingMode>("fixed");
  const [permStatus, setPermStatus] = useState<string>("undetermined");
  const [adaptiveWindows, setAdaptiveWindows] = useState<NotificationWindows | null>(null);
  const [dataPoints, setDataPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        const [savedMode, status, adaptive, count] = await Promise.all([
          AsyncStorage.getItem(TIMING_MODE_KEY),
          getNotificationPermissionStatus(),
          computeAdaptiveWindows(),
          getAppOpenCount(),
        ]);
        if (!active) return;
        setMode((savedMode as TimingMode) ?? "fixed");
        setPermStatus(status);
        setAdaptiveWindows(adaptive);
        setDataPoints(count);
        setLoading(false);
      }
      load();
      return () => { active = false; };
    }, [])
  );

  async function switchMode(next: TimingMode) {
    setMode(next);
    await AsyncStorage.setItem(TIMING_MODE_KEY, next);
    if (permStatus === "granted") {
      const windows = next === "adaptive" && adaptiveWindows ? adaptiveWindows : FIXED_WINDOWS;
      await scheduleCheckInNotifications(windows);
    }
  }

  async function handleRequestPermission() {
    const granted = await requestNotificationPermission();
    setPermStatus(granted ? "granted" : "denied");
    if (granted) {
      const windows = mode === "adaptive" && adaptiveWindows ? adaptiveWindows : FIXED_WINDOWS;
      await scheduleCheckInNotifications(windows);
    }
  }

  const effectiveWindows =
    mode === "adaptive" && adaptiveWindows ? adaptiveWindows : FIXED_WINDOWS;

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.page }]}>
        <ActivityIndicator color={theme.teal.bar} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.page }}
      contentContainerStyle={styles.content}
    >
      {/* Permission status */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>
          Permission
        </Text>
        {permStatus === "granted" ? (
          <View style={[styles.badge, { backgroundColor: theme.teal.bg }]}>
            <Ionicons name="checkmark-circle" size={16} color={theme.teal.fg} />
            <Text style={[styles.badgeText, { color: theme.teal.fg }]}>
              Notifications enabled
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.badge, { backgroundColor: theme.amber.bg }]}>
              <Ionicons name="alert-circle" size={16} color={theme.amber.fg} />
              <Text style={[styles.badgeText, { color: theme.amber.fg }]}>
                {permStatus === "denied"
                  ? "Notifications blocked — enable in device Settings"
                  : "Notifications not yet enabled"}
              </Text>
            </View>
            {permStatus !== "denied" && (
              <Pressable
                onPress={handleRequestPermission}
                style={[styles.btn, { backgroundColor: theme.teal.bar }]}
              >
                <Text style={styles.btnText}>Enable notifications</Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {/* Timing mode */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>
          Check-in timing
        </Text>

        <Pressable
          onPress={() => switchMode("fixed")}
          style={[
            styles.modeOption,
            {
              borderColor: mode === "fixed" ? theme.teal.bar : theme.cardBorder,
              backgroundColor: mode === "fixed" ? theme.teal.bg : "transparent",
            },
          ]}
        >
          <View style={styles.modeHeader}>
            <Ionicons
              name={mode === "fixed" ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={mode === "fixed" ? theme.teal.bar : theme.textSoft}
            />
            <Text
              style={[
                styles.modeTitle,
                { color: mode === "fixed" ? theme.teal.fg : theme.textStrong },
              ]}
            >
              Fixed times
            </Text>
          </View>
          <Text style={[styles.modeBody, { color: theme.textSoft }]}>
            Reminders at consistent times every day.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => switchMode("adaptive")}
          style={[
            styles.modeOption,
            {
              borderColor: mode === "adaptive" ? theme.teal.bar : theme.cardBorder,
              backgroundColor: mode === "adaptive" ? theme.teal.bg : "transparent",
            },
          ]}
        >
          <View style={styles.modeHeader}>
            <Ionicons
              name={mode === "adaptive" ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={mode === "adaptive" ? theme.teal.bar : theme.textSoft}
            />
            <Text
              style={[
                styles.modeTitle,
                { color: mode === "adaptive" ? theme.teal.fg : theme.textStrong },
              ]}
            >
              Adaptive
            </Text>
          </View>
          <Text style={[styles.modeBody, { color: theme.textSoft }]}>
            Learns your routine and shifts reminders to when you actually use the app.
            Takes 2 weeks of data to personalise.
          </Text>
        </Pressable>
      </View>

      {/* Current schedule */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <Text style={[styles.sectionTitle, { color: theme.textStrong }]}>
          Current schedule
        </Text>

        {mode === "adaptive" && !adaptiveWindows && (
          <View style={[styles.badge, { backgroundColor: theme.amber.bg }]}>
            <Ionicons name="time-outline" size={15} color={theme.amber.fg} />
            <Text style={[styles.badgeText, { color: theme.amber.fg }]}>
              Gathering data ({dataPoints}/14 days tracked) — using fixed times until then
            </Text>
          </View>
        )}

        {mode === "adaptive" && adaptiveWindows && (
          <Text style={[styles.adaptiveNote, { color: theme.textSoft }]}>
            Based on your usage pattern (from {dataPoints} app opens):
          </Text>
        )}

        <View style={styles.timeGrid}>
          {(
            [
              { key: "morning",   label: "Morning",   icon: "sunny-outline"  },
              { key: "afternoon", label: "Afternoon",  icon: "partly-sunny-outline" },
              { key: "evening",   label: "Evening",    icon: "moon-outline"   },
              { key: "night",     label: "Night",      icon: "star-outline"   },
            ] as { key: keyof NotificationWindows; label: string; icon: keyof typeof Ionicons.glyphMap }[]
          ).map(({ key, label, icon }) => (
            <View key={key} style={[styles.timeCell, { backgroundColor: theme.teal.bg }]}>
              <Ionicons name={icon} size={14} color={theme.teal.sub} />
              <Text style={[styles.timeCellLabel, { color: theme.teal.sub }]}>{label}</Text>
              <Text style={[styles.timeCellValue, { color: theme.teal.fg }]}>
                {formatTime(effectiveWindows[key])}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 14, borderWidth: 0.5, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 15, fontWeight: "600" },
  badge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 10,
    padding: 10,
  },
  badgeText: { fontSize: 13, flex: 1 },
  btn: { borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  modeOption: { borderRadius: 12, borderWidth: 1.5, padding: 14, gap: 6 },
  modeHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  modeTitle: { fontSize: 15, fontWeight: "600" },
  modeBody: { fontSize: 13, lineHeight: 18, paddingLeft: 30 },
  adaptiveNote: { fontSize: 12 },
  timeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  timeCell: {
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    gap: 4,
    flexGrow: 1,
    minWidth: 70,
  },
  timeCellLabel: { fontSize: 11 },
  timeCellValue: { fontSize: 15, fontWeight: "600" },
});
