import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, View, Text, Switch, Pressable, StyleSheet, Alert, Platform } from "react-native";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { useTheme } from "../../theme/ThemeContext";
import { FONT_SIZES, SPACING } from "../../theme/tokens";
import { api } from "../../api/client";
import { getMuteUntil, muteFor, clearMute, untilTomorrow7am, MUTE_PRESETS } from "../../lib/muteNotifications";
import { useFocusEffect } from "@react-navigation/native";
let notifee: any;
let IntentLauncher: any;
try { notifee = require("@notifee/react-native").default; } catch { notifee = null; }
try { IntentLauncher = require("expo-intent-launcher"); } catch { IntentLauncher = null; }

type SmartNotifs = {
  meal_reminders?: { enabled?: boolean; breakfast?: any; lunch?: any; dinner?: any };
  glucose_spike?: { enabled?: boolean };
  glucose_threshold?: { enabled?: boolean; low_mg_dl?: number; high_mg_dl?: number };
  glucose_trend_alert?: { enabled?: boolean };
  evening_checkin?: { enabled?: boolean; hour?: number };
  water_reminder?: { enabled?: boolean; start_hour?: number; goal?: number };
  streak_protection?: { enabled?: boolean; hour?: number };
  mood_checkin?: { enabled?: boolean; hour?: number };
  book_reminder?: { enabled?: boolean; hour?: number };
  hobby_reminder?: { enabled?: boolean; hour?: number };
  spending_alerts?: { enabled?: boolean; daily_budget?: number };
  mindfulness_reminder?: { enabled?: boolean; hour?: number };
  sleep_reminder?: { enabled?: boolean; hour?: number };
  workout_reminder?: { enabled?: boolean; days_threshold?: number };
  step_goal?: { enabled?: boolean; goal?: number };
};

type HealthNotifs = {
  medication_reminders_enabled?: boolean;
  medication_morning_hour?: number;
  medication_midday_hour?: number;
  medication_evening_hour?: number;
  period_approaching_reminder_enabled?: boolean;
  period_approaching_lead_days?: number;
  cycle_log_reminders_enabled?: boolean;
  cycle_log_hour?: number;
};

// Default formatter: value is an hour of day → am/pm label.
function formatHour(h: number): string {
  return h === 0 ? "12am" : h < 12 ? h + "am" : h === 12 ? "12pm" : (h - 12) + "pm";
}

function HourChips({ hours, current, onSelect, accentColor, theme, format }: {
  hours: number[]; current: number; onSelect: (h: number) => void; accentColor: string; theme: any;
  /** Formats the chip label. Defaults to am/pm hour formatting — pass one for non-hour values (mg/dL, steps, $, days). */
  format?: (v: number) => string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
        {hours.map((h) => {
          const label = (format ?? formatHour)(h);
          return (
            <Pressable key={h} onPress={() => onSelect(h)}
              style={[styles.chip, { backgroundColor: current === h ? accentColor : theme.page, borderColor: theme.ink }]}>
              <Text style={{ color: current === h ? "#fff" : theme.textSoft, fontSize: 12 }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

function ToggleRow({ label, value, onChange, theme }: { label: string; value: boolean; onChange: (v: boolean) => void; theme: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
      <Text style={{ color: theme.textStrong, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: theme.cardBorder, true: theme.teal.bar }} thumbColor="#fff" />
    </View>
  );
}

function SectionHeader({ title, isCollapsed, onToggle }: { title: string; isCollapsed: boolean; onToggle: () => void }) {
  const { theme } = useTheme();
  return (
    <Pressable onPress={onToggle} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md, marginTop: SPACING.md }}>
      <Text style={{ fontSize: FONT_SIZES.label, fontWeight: "800", color: theme.textSoft, letterSpacing: 0.8 }}>{title.toUpperCase()}</Text>
      <Text style={{ fontSize: 18, color: theme.textSoft }}>{isCollapsed ? "›" : "⌄"}</Text>
    </Pressable>
  );
}

export function NotificationsSettingsScreen() {
  const { theme } = useTheme();
  const [sn, setSnState] = useState<SmartNotifs>({});
  const [hn, setHnState] = useState<HealthNotifs>({});
  // Refs mirror the latest state so rapid successive saves merge from the
  // freshest values instead of a stale closure (see SocialSettingsScreen).
  const snRef = React.useRef<SmartNotifs>({});
  const hnRef = React.useRef<HealthNotifs>({});
  const setSn = (v: SmartNotifs) => { snRef.current = v; setSnState(v); };
  const setHn = (v: HealthNotifs) => { hnRef.current = v; setHnState(v); };
  const [saving, setSaving] = useState(false);
  const [muteUntilMs, setMuteUntilMs] = useState<number | null>(null);
  const [cycleEnabled, setCycleEnabled] = useState(true);
  const [batteryOptEnabled, setBatteryOptEnabled] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Health: false,
    Meals: false,
    Reminders: false,
  });

  useEffect(() => {
    api.getSettings().then((s) => {
      setSn(s?.smart_notifications ?? {});
      setHn(s?.health_notifications ?? {});
    }).catch(() => {});
    getMuteUntil().then(setMuteUntilMs).catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      api.getTabPreferences()
        .then((p: any) => { if (!cancelled) setCycleEnabled(p?.health?.cycle ?? false); })
        .catch(() => {});
      if (Platform.OS === "android" && notifee) {
        notifee.isBatteryOptimizationEnabled()
          .then((on: boolean) => { if (!cancelled) setBatteryOptEnabled(on); })
          .catch(() => {});
      }
      return () => { cancelled = true; };
    }, [])
  );

  function toggleSection(name: string) {
    setCollapsed((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  async function save(patch: SmartNotifs) {
    const prev = snRef.current;
    const merged = { ...prev, ...patch };
    setSn(merged);
    setSaving(true);
    try {
      // Send the freshest merged state — a later toggle updates snRef before
      // this request resolves, so no request reverts another's change.
      await api.patchSettings({ smart_notifications: snRef.current });
    } catch (e: any) {
      // Roll back only the keys this call changed, against the latest state.
      const rollback: any = { ...snRef.current };
      for (const k of Object.keys(patch)) rollback[k] = (prev as any)[k];
      setSn(rollback);
      Alert.alert("Error", e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function saveHealth(patch: HealthNotifs) {
    const prev = hnRef.current;
    const merged = { ...prev, ...patch };
    setHn(merged);
    setSaving(true);
    try {
      await api.patchSettings({ health_notifications: hnRef.current });
    } catch (e: any) {
      const rollback: any = { ...hnRef.current };
      for (const k of Object.keys(patch)) rollback[k] = (prev as any)[k];
      setHn(rollback);
      Alert.alert("Error", e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function patchMeals(patch: object) { save({ meal_reminders: { ...(snRef.current.meal_reminders ?? {}), ...patch } }); }
  function patchMeal(meal: "breakfast" | "lunch" | "dinner", patch: object) {
    patchMeals({ [meal]: { ...(snRef.current.meal_reminders?.[meal] ?? {}), ...patch } });
  }

  return (
    <ScrollView style={{ backgroundColor: theme.page }} contentContainerStyle={styles.content}>
      {saving && <LoadingIndicator size="small" style={{ alignSelf: "flex-end" }} />}

      {/* Mute */}
      <Text style={[styles.groupLabel, { color: theme.textSoft }]}>SILENCE ALL</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        {muteUntilMs ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.textSoft, fontSize: 12 }}>
              Muted until {new Date(muteUntilMs).toLocaleString()}
            </Text>
            <Pressable
              onPress={async () => { await clearMute(); setMuteUntilMs(null); }}
              style={[styles.btn, { backgroundColor: theme.coral.bg, borderColor: theme.coral.sub, marginTop: 0 }]}
            >
              <Text style={{ color: theme.coral.fg, fontWeight: "500" }}>Clear mute</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {MUTE_PRESETS.map((preset) => (
              <Pressable key={preset.label}
                onPress={async () => {
                  const until = preset.ms === -1 ? untilTomorrow7am() : Date.now() + preset.ms;
                  await muteFor(until - Date.now());
                  setMuteUntilMs(until);
                }}
                style={[styles.chip, { borderColor: theme.ink, backgroundColor: theme.page }]}
              >
                <Text style={{ color: theme.textStrong, fontSize: 12 }}>{preset.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Battery optimization */}
      {Platform.OS === "android" && (
        <>
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>BATTERY</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>
              Battery optimization can delay or block background notifications. Exempt Ripple to keep reminders reliable.
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
              <Text style={{ color: theme.textStrong, flex: 1 }}>
                Battery optimization {batteryOptEnabled === false ? "✓ exempt (good)" : batteryOptEnabled === true ? "⚠ restricted" : ""}
              </Text>
              <Pressable
                onPress={() => {
                  IntentLauncher?.startActivityAsync?.("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", { data: "package:com.kellehs.wellness" })
                    .then(() => notifee?.isBatteryOptimizationEnabled().then((on: boolean) => setBatteryOptEnabled(on)).catch(() => {}))
                    .catch(() => Alert.alert("Unavailable", "Could not open battery settings."));
                }}
                style={[styles.chip, { borderColor: theme.teal.bar, backgroundColor: theme.teal.tint ?? theme.card, paddingHorizontal: 14, paddingVertical: 7 }]}
              >
                <Text style={{ color: theme.teal.fg, fontWeight: "700", fontSize: 12 }}>Open settings</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {/* ── HEALTH section ─────────────────────────────────────────────────── */}
      <SectionHeader title="Health" isCollapsed={collapsed.Health} onToggle={() => toggleSection("Health")} />

      {!collapsed.Health && (
        <>
          {/* Glucose spike */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>GLUCOSE SPIKE</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Asks if you ate something when glucose rises 30+ mg/dL in an hour.</Text>
            <ToggleRow label="Prompt on glucose spike" value={sn.glucose_spike?.enabled === true}
              onChange={(v) => save({ glucose_spike: { ...sn.glucose_spike, enabled: v } })} theme={theme} />
          </View>

          {/* Glucose thresholds */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>GLUCOSE THRESHOLDS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Alerts when glucose goes below or above fixed boundaries.</Text>
            <ToggleRow label="Low/high glucose alerts" value={sn.glucose_threshold?.enabled === true}
              onChange={(v) => save({ glucose_threshold: { ...sn.glucose_threshold, enabled: v } })} theme={theme} />
            {sn.glucose_threshold?.enabled === true && (
              <>
                <Text style={[styles.subLabel, { color: theme.textStrong }]}>Low alert (mg/dL)</Text>
                <HourChips hours={[55, 60, 65, 70, 75, 80]} current={sn.glucose_threshold?.low_mg_dl ?? 70}
                  onSelect={(v) => save({ glucose_threshold: { ...sn.glucose_threshold, low_mg_dl: v } })}
                  accentColor={theme.coral.sub} theme={theme} format={(v) => String(v)} />
                <Text style={[styles.subLabel, { color: theme.textStrong }]}>High alert (mg/dL)</Text>
                <HourChips hours={[200, 220, 240, 250, 270, 300]} current={sn.glucose_threshold?.high_mg_dl ?? 250}
                  onSelect={(v) => save({ glucose_threshold: { ...sn.glucose_threshold, high_mg_dl: v } })}
                  accentColor={theme.coral.sub} theme={theme} format={(v) => String(v)} />
              </>
            )}
            <View style={{ height: 10 }} />
            <Text style={[styles.desc, { color: theme.textSoft }]}>Early-warning heads-up before you cross a hard threshold — fires when glucose is elevated and rising, or heading toward low and falling.</Text>
            <ToggleRow label="Rising/falling early warning" value={sn.glucose_trend_alert?.enabled === true}
              onChange={(v) => save({ glucose_trend_alert: { ...sn.glucose_trend_alert, enabled: v } })} theme={theme} />
          </View>

          {/* Step goal */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>STEP GOAL</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Alerts when you're close to your daily step goal and celebrates when you hit it.</Text>
            <ToggleRow label="Step goal alerts" value={sn.step_goal?.enabled === true}
              onChange={(v) => save({ step_goal: { ...sn.step_goal, enabled: v } })} theme={theme} />
            {sn.step_goal?.enabled === true && (
              <>
                <Text style={[styles.subLabel, { color: theme.textStrong }]}>Daily goal</Text>
                <HourChips hours={[5000, 7500, 8000, 10000, 12000, 15000]} current={sn.step_goal?.goal ?? 10000}
                  onSelect={(v) => save({ step_goal: { ...sn.step_goal, goal: v } })}
                  accentColor={theme.teal.sub} theme={theme} format={(v) => v.toLocaleString()} />
              </>
            )}
          </View>

          {/* Bedtime reminder */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>BEDTIME REMINDER</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Reminds you to start winding down at your target bedtime.</Text>
            <ToggleRow label="Bedtime reminder" value={sn.sleep_reminder?.enabled === true}
              onChange={(v) => save({ sleep_reminder: { ...sn.sleep_reminder, enabled: v } })} theme={theme} />
            {sn.sleep_reminder?.enabled === true && (
              <HourChips hours={[18, 19, 20, 21, 22, 23]} current={sn.sleep_reminder?.hour ?? 22}
                onSelect={(h) => save({ sleep_reminder: { ...sn.sleep_reminder, hour: h } })}
                accentColor={theme.teal.sub} theme={theme} />
            )}
          </View>

          {/* Workout reminder */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>WORKOUT REMINDER</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Nudges you when you haven't had a completed workout session in a while.</Text>
            <ToggleRow label="Remind me to work out" value={sn.workout_reminder?.enabled === true}
              onChange={(v) => save({ workout_reminder: { ...sn.workout_reminder, enabled: v } })} theme={theme} />
            {sn.workout_reminder?.enabled === true && (
              <>
                <Text style={[styles.subLabel, { color: theme.textStrong }]}>Remind after (days inactive)</Text>
                <HourChips hours={[2, 3, 4, 5, 7]} current={sn.workout_reminder?.days_threshold ?? 3}
                  onSelect={(v) => save({ workout_reminder: { ...sn.workout_reminder, days_threshold: v } })}
                  accentColor={theme.teal.sub} theme={theme} format={(v) => v + (v === 1 ? " day" : " days")} />
              </>
            )}
          </View>

          {/* Cycle reminders */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>CYCLE REMINDERS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            {cycleEnabled ? (
              <>
                <ToggleRow label="Period approaching reminder"
                  value={hn.period_approaching_reminder_enabled === true}
                  onChange={(v) => saveHealth({ period_approaching_reminder_enabled: v })} theme={theme} />
                {hn.period_approaching_reminder_enabled === true && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={[styles.subLabel, { color: theme.textStrong }]}>Days before to remind</Text>
                    <HourChips hours={[1, 2, 3, 4, 5]}
                      current={hn.period_approaching_lead_days ?? 2}
                      onSelect={(d) => saveHealth({ period_approaching_lead_days: d })}
                      accentColor={theme.coral?.sub ?? "#E87A96"} theme={theme}
                      format={(v) => v + (v === 1 ? " day" : " days")} />
                  </View>
                )}
                <View style={{ marginTop: 8 }}>
                  <ToggleRow label="Daily cycle log reminder (optional)"
                    value={hn.cycle_log_reminders_enabled === true}
                    onChange={(v) => saveHealth({ cycle_log_reminders_enabled: v })} theme={theme} />
                  {hn.cycle_log_reminders_enabled === true && (
                    <HourChips hours={[17, 18, 19, 20, 21]}
                      current={hn.cycle_log_hour ?? 20}
                      onSelect={(h) => saveHealth({ cycle_log_hour: h })}
                      accentColor={theme.coral?.sub ?? "#E87A96"} theme={theme} />
                  )}
                </View>
              </>
            ) : (
              <Text style={{ color: theme.textSoft, fontSize: 12 }}>Enable the Cycle tracker in Tab Settings to use cycle reminders.</Text>
            )}
          </View>
        </>
      )}

      {/* ── MEALS section ──────────────────────────────────────────────────── */}
      <SectionHeader title="Meals" isCollapsed={collapsed.Meals} onToggle={() => toggleSection("Meals")} />

      {!collapsed.Meals && (
        <>
          {/* Meal reminders */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>MEAL REMINDERS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <ToggleRow label="Remind me to log meals" value={sn.meal_reminders?.enabled === true}
              onChange={(v) => patchMeals({ enabled: v })} theme={theme} />
            {sn.meal_reminders?.enabled === true && (
              <>
                {(["breakfast", "lunch", "dinner"] as const).map((meal) => {
                  const defaults: Record<string, number> = { breakfast: 9, lunch: 13, dinner: 19 };
                  const cfg = sn.meal_reminders?.[meal] ?? {};
                  const hours = meal === "breakfast" ? [7, 8, 9, 10] : meal === "lunch" ? [11, 12, 13, 14] : [17, 18, 19, 20, 21];
                  return (
                    <View key={meal} style={{ marginTop: 8, gap: 4 }}>
                      <ToggleRow
                        label={meal.charAt(0).toUpperCase() + meal.slice(1)}
                        value={cfg.enabled !== false}
                        onChange={(v) => patchMeal(meal, { enabled: v })}
                        theme={theme}
                      />
                      {cfg.enabled !== false && (
                        <HourChips hours={hours} current={cfg.hour ?? defaults[meal]} onSelect={(h) => patchMeal(meal, { hour: h })} accentColor={theme.coral.sub} theme={theme} />
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {/* Water reminder */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>WATER REMINDER</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Nudges every 2 hours if you haven't hit your daily glass goal.</Text>
            <ToggleRow label="Remind me to drink water" value={sn.water_reminder?.enabled === true}
              onChange={(v) => save({ water_reminder: { ...sn.water_reminder, enabled: v } })} theme={theme} />
            {sn.water_reminder?.enabled === true && (
              <>
                <Text style={[styles.subLabel, { color: theme.textStrong }]}>Start at</Text>
                <HourChips hours={[5, 6, 7, 8, 9, 10, 11, 12]} current={sn.water_reminder?.start_hour ?? 9}
                  onSelect={(h) => save({ water_reminder: { ...sn.water_reminder, start_hour: h } })}
                  accentColor={theme.blue.sub} theme={theme} />
              </>
            )}
          </View>

          {/* Evening check-in */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>EVENING CHECK-IN</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <ToggleRow label="Daily end-of-day summary" value={sn.evening_checkin?.enabled === true}
              onChange={(v) => save({ evening_checkin: { ...sn.evening_checkin, enabled: v } })} theme={theme} />
            {sn.evening_checkin?.enabled === true && (
              <HourChips hours={[17, 18, 19, 20, 21, 22, 23]} current={sn.evening_checkin?.hour ?? 21}
                onSelect={(h) => save({ evening_checkin: { ...sn.evening_checkin, hour: h } })}
                accentColor={theme.teal.bar} theme={theme} />
            )}
          </View>
        </>
      )}

      {/* ── REMINDERS section ──────────────────────────────────────────────── */}
      <SectionHeader title="Reminders" isCollapsed={collapsed.Reminders} onToggle={() => toggleSection("Reminders")} />

      {!collapsed.Reminders && (
        <>
          {/* Mood check-in */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>MOOD CHECK-IN</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Nudges you to log a mood check-in if you haven't yet.</Text>
            <ToggleRow label="Remind me to check in" value={sn.mood_checkin?.enabled === true}
              onChange={(v) => save({ mood_checkin: { ...sn.mood_checkin, enabled: v } })} theme={theme} />
            {sn.mood_checkin?.enabled === true && (
              <HourChips hours={[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]} current={sn.mood_checkin?.hour ?? 14}
                onSelect={(h) => save({ mood_checkin: { ...sn.mood_checkin, hour: h } })}
                accentColor={theme.teal.bar} theme={theme} />
            )}
          </View>

          {/* Streak protection */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>STREAK PROTECTION</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Warns you before midnight if you haven't logged today and have an active streak.</Text>
            <ToggleRow label="Protect my streak" value={sn.streak_protection?.enabled === true}
              onChange={(v) => save({ streak_protection: { ...sn.streak_protection, enabled: v } })} theme={theme} />
            {sn.streak_protection?.enabled === true && (
              <HourChips hours={[18, 19, 20, 21, 22]} current={sn.streak_protection?.hour ?? 20}
                onSelect={(h) => save({ streak_protection: { ...sn.streak_protection, hour: h } })}
                accentColor={theme.coral.sub} theme={theme} />
            )}
          </View>

          {/* Medication reminders */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>MEDICATION REMINDERS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Reminds you when each time-of-day medication slot is due and hasn't been logged.</Text>
            <ToggleRow label="Medication reminders" value={hn.medication_reminders_enabled === true}
              onChange={(v) => saveHealth({ medication_reminders_enabled: v })} theme={theme} />
            {hn.medication_reminders_enabled === true && (
              <>
                {([
                  { key: "medication_morning_hour" as const, label: "Morning reminder", hours: [6, 7, 8, 9, 10], def: 8 },
                  { key: "medication_midday_hour"  as const, label: "Midday reminder",  hours: [11, 12, 13, 14], def: 12 },
                  { key: "medication_evening_hour" as const, label: "Evening reminder", hours: [18, 19, 20, 21, 22], def: 20 },
                ]).map(({ key, label, hours, def }) => (
                  <View key={key} style={{ marginTop: 8 }}>
                    <Text style={[styles.subLabel, { color: theme.textStrong }]}>{label}</Text>
                    <HourChips hours={hours} current={hn[key] ?? def}
                      onSelect={(h) => saveHealth({ [key]: h })}
                      accentColor={theme.teal.sub} theme={theme} />
                  </View>
                ))}
              </>
            )}
          </View>

          {/* Mindfulness reminder */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>MINDFULNESS REMINDER</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Daily nudge to take a few minutes for breathing or meditation.</Text>
            <ToggleRow label="Remind me to practice" value={sn.mindfulness_reminder?.enabled === true}
              onChange={(v) => save({ mindfulness_reminder: { ...sn.mindfulness_reminder, enabled: v } })} theme={theme} />
            {sn.mindfulness_reminder?.enabled === true && (
              <HourChips hours={[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]} current={sn.mindfulness_reminder?.hour ?? 20}
                onSelect={(h) => save({ mindfulness_reminder: { ...sn.mindfulness_reminder, hour: h } })}
                accentColor={theme.teal.sub} theme={theme} />
            )}
          </View>

          {/* Book reminder */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>READING REMINDER</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Reminds you to log reading time if you have a book in progress.</Text>
            <ToggleRow label="Remind me to read" value={sn.book_reminder?.enabled === true}
              onChange={(v) => save({ book_reminder: { ...sn.book_reminder, enabled: v } })} theme={theme} />
            {sn.book_reminder?.enabled === true && (
              <HourChips hours={[7, 8, 9, 10, 11, 12, 17, 18, 19, 20, 21, 22]} current={sn.book_reminder?.hour ?? 20}
                onSelect={(h) => save({ book_reminder: { ...sn.book_reminder, hour: h } })}
                accentColor={theme.teal.bar} theme={theme} />
            )}
          </View>

          {/* Activity reminder */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>ACTIVITY REMINDER</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Reminds you to log a hobby or activity if you have any set up.</Text>
            <ToggleRow label="Remind me to log activities" value={sn.hobby_reminder?.enabled === true}
              onChange={(v) => save({ hobby_reminder: { ...sn.hobby_reminder, enabled: v } })} theme={theme} />
            {sn.hobby_reminder?.enabled === true && (
              <HourChips hours={[7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]} current={sn.hobby_reminder?.hour ?? 18}
                onSelect={(h) => save({ hobby_reminder: { ...sn.hobby_reminder, hour: h } })}
                accentColor={theme.teal.bar} theme={theme} />
            )}
          </View>

          {/* Spending alerts */}
          <Text style={[styles.groupLabel, { color: theme.textSoft }]}>SPENDING ALERTS</Text>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[styles.desc, { color: theme.textSoft }]}>Notifies you when today's spending exceeds your daily budget.</Text>
            <ToggleRow label="Daily budget alert" value={sn.spending_alerts?.enabled === true}
              onChange={(v) => save({ spending_alerts: { ...sn.spending_alerts, enabled: v } })} theme={theme} />
            {sn.spending_alerts?.enabled === true && (
              <>
                <Text style={[styles.subLabel, { color: theme.textStrong }]}>Daily budget ($)</Text>
                <HourChips hours={[25, 50, 75, 100, 150, 200, 250]} current={sn.spending_alerts?.daily_budget ?? 100}
                  onSelect={(v) => save({ spending_alerts: { ...sn.spending_alerts, daily_budget: v } })}
                  accentColor={theme.teal.sub} theme={theme} format={(v) => "$" + v} />
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  groupLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginTop: 4, marginBottom: -4 },
  card: { borderRadius: 22, borderWidth: 2, padding: 16, gap: 8 },
  desc: { fontSize: 12, marginBottom: 4 },
  subLabel: { fontSize: 13, marginTop: 8 },
  btn: { borderWidth: 2, borderRadius: 16, paddingVertical: 10, alignItems: "center" },
  chip: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
});
