import React, { useCallback, useState } from "react";
import { ScrollView, View, Text, Pressable, Switch, StyleSheet, Alert, Linking, TextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useFocusEffect } from "@react-navigation/core";
import { useNavigation } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES, SPACING, RADIUS } from "../theme/tokens";
import { PALETTES } from "../theme/palettes";
import { api } from "../api/client";
import { logout } from "../lib/auth";
import { reportError } from "../utils/errorReport";
import { QUIET_PRESETS, muteFor, getMuteUntil, clearMute } from "../lib/muteNotifications";
import { toast } from "../lib/toast";
import Constants from "expo-constants";
import { FEATURE_INTROS, type FeatureIntro } from "../onboarding/featureIntros";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { resetAllFeatureIntros } from "../onboarding/useFeatureIntro";

const SUPPORT_EMAIL: string =
  (Constants.expoConfig?.extra as any)?.supportEmail ?? "support@ripple.test";

type Journey = { total_meals: number; total_mood_checkins: number; total_active_days: number; member_since: string | null };

function MenuRow({ title, subtitle, onPress, theme, accent }: {
  title: string; subtitle?: string; onPress: () => void; theme: any; accent?: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: theme.cardBorder }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: accent ?? theme.textStrong, fontSize: 15, fontWeight: "600" }}>{title}</Text>
        {subtitle ? <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      <Text style={{ color: theme.textSoft, fontSize: 22, lineHeight: 26 }}>›</Text>
    </Pressable>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { theme, paletteId } = useTheme();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(true);
  const [muteUntil, setMuteUntil] = useState<number | null>(null);
  const [fastingEnabled, setFastingEnabled] = useState(false);
  const [search, setSearch] = useState("");
  const [backupNudge, setBackupNudge] = useState(false);

  // Cancel legacy expo-notifications on every Settings open
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    setJourneyLoading(true);
    api.journey()
      .then((j) => { if (!cancelled) setJourney(j); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setJourneyLoading(false); });
    getMuteUntil().then((v) => { if (!cancelled) setMuteUntil(v); }).catch(() => {});
    AsyncStorage.getItem("fasting_timer_enabled").then((v) => { if (!cancelled) setFastingEnabled(v === "1"); }).catch(() => {});
    AsyncStorage.getItem("last_json_backup").then(v => {
      if (cancelled) return;
      if (!v) { setBackupNudge(true); return; }
      setBackupNudge((Date.now() - parseInt(v)) / 86400000 > 30);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []));

  async function handleFastingToggle(value: boolean) {
    setFastingEnabled(value);
    await AsyncStorage.setItem("fasting_timer_enabled", value ? "1" : "0");
  }

  function fmtMuteTime(ts: number): string {
    const d = new Date(ts);
    return d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
  }

  async function handlePreset(preset: typeof QUIET_PRESETS[number]) {
    if (preset.id === 'focus') {
      Alert.alert(
        "Focus duration",
        "How long do you need to focus?",
        [
          { text: "30 min",  onPress: () => void activateMute(30 * 60 * 1000,       preset.mode) },
          { text: "1 hour",  onPress: () => void activateMute(60 * 60 * 1000,       preset.mode) },
          { text: "2 hours", onPress: () => void activateMute(2 * 60 * 60 * 1000,   preset.mode) },
          { text: "4 hours", onPress: () => void activateMute(4 * 60 * 60 * 1000,   preset.mode) },
          { text: "Cancel",  style: "cancel" },
        ]
      );
    } else {
      await activateMute(preset.durationMs as number, preset.mode);
    }
  }

  async function activateMute(ms: number, mode: "silent" | "vibrate") {
    await muteFor(ms, mode);
    const until = await getMuteUntil();
    setMuteUntil(until);
    toast("Quiet mode on until " + (until ? fmtMuteTime(until) : "?"));
  }

  async function handleClearMute() {
    await clearMute();
    setMuteUntil(null);
    toast("Quiet mode off");
  }

  function nav(screen: string) { navigation.navigate(screen); }

  const [openIntro, setOpenIntro] = useState<FeatureIntro | null>(null);

  // Returns true if any of the given labels/texts match the current search query
  function matches(...labels: string[]): boolean {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return labels.some((l) => l.toLowerCase().includes(q));
  }

  const searching = search.trim().length > 0;

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>

      {/* Search bar */}
      <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: theme.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: theme.cardBorder, paddingHorizontal: SPACING.md, marginBottom: SPACING.md }}>
        <Text style={{ marginRight: SPACING.sm, fontSize: 16 }}>🔍</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search settings..."
          placeholderTextColor={theme.textSoft}
          style={{ flex: 1, paddingVertical: SPACING.sm, fontSize: FONT_SIZES.body, color: theme.textStrong }}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Text style={{ color: theme.textSoft, fontSize: 16 }}>✕</Text>
          </Pressable>
        )}
      </View>

      {/* Journey — top of settings (hidden when searching) */}
      {!searching && (
        journeyLoading ? (
          <View style={[styles.journeyCard, { backgroundColor: theme.teal.tint, borderColor: theme.ink }]}>
            <LoadingIndicator size="small" color={theme.teal.fg} />
          </View>
        ) : journey ? (
          <View style={[styles.journeyCard, { backgroundColor: theme.teal.tint, borderColor: theme.ink }]}>
            <Text style={[styles.journeyTitle, { color: theme.teal.fg }]}>Your journey so far</Text>
            {journey.member_since && (
              <Text style={{ color: theme.teal.sub, fontSize: 12, marginBottom: 12 }}>
                Member since {new Date(journey.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </Text>
            )}
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                { value: journey.total_meals, label: "meals logged" },
                { value: journey.total_mood_checkins, label: "mood check-ins" },
                { value: journey.total_active_days, label: "active days" },
              ].map((stat) => (
                <View key={stat.label} style={[styles.statChip, { backgroundColor: theme.card, borderColor: theme.teal.sub }]}>
                  <Text style={{ color: theme.teal.fg, fontSize: 22, fontWeight: "800" }}>{stat.value}</Text>
                  <Text style={{ color: theme.teal.sub, fontSize: 11, fontWeight: "600" }}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null
      )}

      {/* Appearance */}
      {matches("Theme", "Appearance", "Customize Tabs", "Tabs", "bottom bar", "colour", "color") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>APPEARANCE</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {matches("Theme", "Appearance", "colour", "color") && (
              <MenuRow title="Theme" subtitle={PALETTES[paletteId]?.name} onPress={() => nav("SettingsAppearance")} theme={theme} />
            )}
            {matches("Theme", "Appearance", "colour", "color") && matches("Customize Tabs", "Tabs", "bottom bar") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Customize Tabs", "Tabs", "bottom bar") && (
              <MenuRow title="Customize Tabs" subtitle="Choose which tabs appear in the bottom bar" onPress={() => nav("SettingsCustomizeTabs")} theme={theme} />
            )}
          </View>
        </>
      )}

      {/* Data Sources */}
      {matches("Data Sources", "Health Connect", "Sync", "permissions", "Dexcom", "CGM", "Connected Banks", "Plaid", "transactions", "Hardcover", "books", "reading") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>DATA SOURCES</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {matches("Health Connect", "Sync", "permissions", "live tracking") && (
              <MenuRow title="Health Connect" subtitle="Sync, permissions & live tracking" onPress={() => nav("SettingsHealthConnect")} theme={theme} />
            )}
            {matches("Health Connect", "Sync", "permissions", "live tracking") && matches("Dexcom", "CGM", "credentials") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Dexcom", "CGM", "credentials") && (
              <MenuRow title="Dexcom" subtitle="CGM credentials" onPress={() => nav("SettingsDexcom")} theme={theme} />
            )}
            {matches("Dexcom", "CGM", "credentials") && matches("Connected Banks", "Plaid", "transactions") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Connected Banks", "Plaid", "transactions", "auto-import") && (
              <MenuRow title="Connected Banks" subtitle="Plaid · auto-import transactions" onPress={() => nav("SettingsBanks")} theme={theme} />
            )}
            {matches("Connected Banks", "Plaid", "transactions", "auto-import") && matches("Hardcover", "books", "reading") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Hardcover", "books", "reading", "sync") && (
              <MenuRow title="Hardcover" subtitle="Sync your book tracking with Hardcover.app" onPress={() => nav("SettingsHardcover")} theme={theme} />
            )}
          </View>
        </>
      )}

      {/* Health */}
      {matches("Health", "Fasting Timer", "fasting", "Medication Reminders", "Import Medications", "CSV") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>HEALTH</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {matches("Fasting Timer", "fasting", "Home screen") && (
              <View style={[styles.row, { borderColor: theme.cardBorder, paddingVertical: 13 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textStrong, fontSize: 15, fontWeight: "600" }}>Fasting Timer</Text>
                  <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 2 }}>Show start/stop timer on Home screen</Text>
                </View>
                <Switch
                  value={fastingEnabled}
                  onValueChange={handleFastingToggle}
                  trackColor={{ false: theme.cardBorder, true: theme.teal.bar }}
                  thumbColor="#fff"
                />
              </View>
            )}
            {matches("Fasting Timer", "fasting", "Home screen") && matches("Medication Reminders", "medication", "reminder") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Medication Reminders", "medication", "reminder", "daily") && (
              <MenuRow title="Medication Reminders" subtitle="Daily reminder times per medication" onPress={() => nav("MedicationReminders")} theme={theme} />
            )}
            {matches("Medication Reminders", "medication", "reminder", "daily") && matches("Import Medications", "CSV") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Import Medications", "CSV", "medication") && (
              <MenuRow title="Import Medications from CSV" onPress={() => nav("MedicationImport")} theme={theme} />
            )}
          </View>
        </>
      )}

      {/* Notifications */}
      {matches("Notifications", "reminders", "mute", "schedules", "Always-on Tracking", "background sync", "persistent") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>NOTIFICATIONS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {matches("Notifications", "Smart reminders", "mute", "schedules") && (
              <MenuRow title="Notifications" subtitle="Smart reminders, mute & schedules" onPress={() => nav("SettingsNotifications")} theme={theme} />
            )}
            {matches("Notifications", "Smart reminders", "mute", "schedules") && matches("Always-on Tracking", "background sync", "persistent") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Always-on Tracking", "background sync", "persistent notification") && (
              <MenuRow title="Always-on Tracking" subtitle="Persistent notification & background sync" onPress={() => nav("SettingsTracking")} theme={theme} />
            )}
          </View>
        </>
      )}

      {/* Quiet Mode */}
      {!searching && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>QUIET MODE</Text>
          {muteUntil !== null && (
            <Pressable
              onPress={handleClearMute}
              style={[styles.quietBanner, { backgroundColor: theme.teal.tint, borderColor: theme.teal.solid }]}
            >
              <Text style={{ color: theme.teal.fg, fontSize: 13, fontWeight: "700", flex: 1 }}>
                Quiet mode active until {fmtMuteTime(muteUntil)} — Tap to cancel
              </Text>
              <Text style={{ color: theme.teal.fg, fontSize: 16 }}>×</Text>
            </Pressable>
          )}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {QUIET_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() => void handlePreset(preset)}
                style={[styles.quietPreset, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
              >
                <Text style={{ fontSize: 22 }}>{preset.emoji}</Text>
                <Text style={{ color: theme.textStrong, fontSize: 13, fontWeight: "700", marginTop: 4 }}>{preset.label}</Text>
                <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "600", marginTop: 2, textAlign: "center" }}>
                  {preset.id === 'meeting' ? "1 hour · Silent" : preset.id === 'cinema' ? "2.5 hrs · Silent" : "Custom · Vibrate only"}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Security */}
      {matches("Security", "App Lock", "Biometric", "unlock") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>SECURITY</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <MenuRow title="App Lock" subtitle="Biometric unlock" onPress={() => nav("SettingsSecurity")} theme={theme} />
          </View>
        </>
      )}

      {/* Preferences */}
      {matches("Preferences", "Week start", "home screen", "start day") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>PREFERENCES</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <MenuRow title="Preferences" subtitle="Week start day & home screen" onPress={() => nav("SettingsPreferences")} theme={theme} />
          </View>
        </>
      )}

      {/* Friend Sharing */}
      {matches("Friend Sharing", "friends", "social", "notifications", "sharing") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>FRIEND SHARING</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <MenuRow title="Friend Sharing" subtitle="Control what friends can see and social notifications" onPress={() => nav("SettingsSocial")} theme={theme} />
          </View>
        </>
      )}

      {/* Export & Backup */}
      {matches("Export", "Backup", "PDF", "JSON", "Google Drive", "report") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>EXPORT & BACKUP</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <MenuRow
              title="Export & Backup"
              subtitle={backupNudge ? "⚠️ No backup in 30+ days — tap to back up" : "PDF report, JSON export & Google Drive"}
              onPress={() => nav("SettingsExportBackup")}
              theme={theme}
              accent={backupNudge ? (theme.amber?.solid ?? "#f59e0b") : undefined}
            />
          </View>
        </>
      )}

      {/* Feature Guide */}
      {matches("Feature Guide", "onboarding", "walkthrough", "learn", "tour", ...FEATURE_INTROS.map(f => f.name)) && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>FEATURE GUIDE</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {FEATURE_INTROS.filter(f => matches("Feature Guide", "learn", "tour", f.name)).map((f, i, arr) => (
              <React.Fragment key={f.key}>
                <MenuRow
                  title={`${f.cards[0].emoji}  ${f.name}`}
                  subtitle={f.cards[0].title}
                  onPress={() => setOpenIntro(f)}
                  theme={theme}
                />
                {i < arr.length - 1 && <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />}
              </React.Fragment>
            ))}
            {matches("Feature Guide", "reset", "show again") && (
              <>
                <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
                <MenuRow
                  title="Show all intros again"
                  subtitle="Every feature intro will re-appear on next visit"
                  onPress={() => {
                    void resetAllFeatureIntros().then(() => toast("Feature intros reset"));
                  }}
                  theme={theme}
                />
              </>
            )}
          </View>
        </>
      )}

      {/* Help */}
      {matches("Help", "FAQ", "bug", "Report a Bug", "Contact", "developer", "email") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>HELP</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {matches("Help", "FAQ") && (
              <MenuRow title="Help & FAQ" onPress={() => nav("Help")} theme={theme} />
            )}
            {matches("Help", "FAQ") && matches("Report a Bug", "bug") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Report a Bug", "bug", "issue") && (
              <MenuRow
                title="Report a Bug"
                subtitle="Send a report to the developer"
                onPress={() => {
                  Alert.alert(
                    'Report a Bug',
                    'Describe the issue in the email. Include what you were doing when it happened.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Open Email',
                        onPress: () => void reportError('User-reported bug (no specific error message)', 'Settings → Report a Bug'),
                      },
                    ]
                  );
                }}
                theme={theme}
              />
            )}
            {matches("Report a Bug", "bug", "issue") && matches("Contact Developer", "contact", "email", "kjsmyre") && (
              <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />
            )}
            {matches("Contact Developer", "contact", "email", "kjsmyre") && (
              <MenuRow
                title="Contact Developer"
                subtitle={SUPPORT_EMAIL}
                onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Ripple Wellness`)}
                theme={theme}
              />
            )}
          </View>
        </>
      )}

      {/* Account */}
      {matches("Account", "Sign out", "logout", "sign in") && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>ACCOUNT</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <MenuRow
              title="Sign out"
              onPress={() => {
                Alert.alert("Sign out", "You'll need to sign in again to access your data.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign out", style: "destructive", onPress: () => logout() },
                ]);
              }}
              theme={theme}
              accent={theme.coral?.fg}
            />
          </View>
        </>
      )}
      {openIntro && (
        <FeatureIntroSheet
          intro={openIntro}
          visible={true}
          onClose={() => setOpenIntro(null)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4, textTransform: "uppercase" },
  card: {
    borderRadius: 26,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  row: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0,
  },
  divider: { height: 1, marginHorizontal: 16 },
  journeyCard: { borderRadius: 26, borderWidth: 2, padding: 16, gap: 4, alignItems: "flex-start" },
  journeyTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  statChip: { flex: 1, borderWidth: 1.5, borderRadius: 16, padding: 10, alignItems: "center", gap: 2 },
  quietBanner: { borderRadius: 16, borderWidth: 2, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  quietPreset: { flex: 1, borderWidth: 2, borderRadius: 16, padding: 10, alignItems: "center", gap: 0 },
});
