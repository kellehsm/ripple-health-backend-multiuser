import React, { useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions
} from "react-native";
import { LoadingIndicator } from "../components/LoadingIndicator";
import * as WebBrowser from "expo-web-browser";
// Lazy-load notifee: native module is absent in Expo Go and throws at import time.
let notifee: any = null;
try { notifee = require("@notifee/react-native").default; } catch {}
import * as IntentLauncher from "expo-intent-launcher";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";
import { GOOGLE_CLIENT_ID, api } from "../api/client";
import { getUserId } from "../lib/auth";
import { requestHealthPermissions } from "../lib/healthConnect";
import { PALETTES, PALETTE_GROUPS } from "../theme/palettes";
import { TabPreferencesScreen } from "./TabPreferencesScreen";
WebBrowser.maybeCompleteAuthSession();

type AccentKey = "teal" | "coral" | "blue" | "amber" | "purple" | "berry" | "violet" | "red";

type Step = "walkthrough" | "theme" | "tabs" | "health" | "drive" | "dexcom" | "notifications" | "battery";

// ── Walkthrough page definitions ──────────────────────────────────────────────

const WALK_PAGES: Array<{
  emoji: string;
  label: string;
  desc: string;
  accentKey: AccentKey;
}> = [
  {
    emoji: "🏠",
    label: "HOME",
    desc: "Your daily command centre — mood check-ins, live glucose, steps, and water at a glance with a personalised AI summary of your day.",
    accentKey: "berry",
  },
  {
    emoji: "❤️",
    label: "HEALTH",
    desc: "Live glucose from your Dexcom CGM, steps, sleep, and resting heart rate — synced automatically from Android Health Connect.",
    accentKey: "teal",
  },
  {
    emoji: "🍜",
    label: "MEALS",
    desc: "Log meals in seconds — scan a barcode, search by name, or pick from your history. Track macros, caffeine, and alcohol alongside your glucose.",
    accentKey: "coral",
  },
  {
    emoji: "📖",
    label: "HOBBIES",
    desc: "Track books you're reading and hobbies you love. Log sessions, build streaks, and see how your activities connect to mood and energy.",
    accentKey: "blue",
  },
  {
    emoji: "✨",
    label: "INSIGHTS",
    desc: "Ripple spots patterns across all your data — how meals shift glucose, when your mood dips, what drives your best weeks. Updated daily.",
    accentKey: "violet",
  },
  {
    emoji: "💰",
    label: "FINANCE",
    desc: "Track spending against a monthly budget, categorise expenses, and see how your financial stress connects to the rest of your wellbeing.",
    accentKey: "purple",
  },
  {
    emoji: "🏋️",
    label: "EXERCISE",
    desc: "Log workouts and track live sessions with a timer. See how your training connects to sleep quality, resting heart rate, and glucose patterns.",
    accentKey: "berry",
  },
  {
    emoji: "👥",
    label: "FRIENDS",
    desc: "Add friends, join step and mood challenges, and see where you rank on the leaderboard. Accountability makes habits stick.",
    accentKey: "teal",
  },
  {
    emoji: "✋",
    label: "GESTURES",
    desc: "Long-hold any chip to log in one tap. Double-tap an insight to pin it. Every screen has shortcuts built in — worth exploring.",
    accentKey: "amber",
  },
  {
    emoji: "🔄",
    label: "REFRESH",
    desc: "Pull down on any screen to refresh your data. You'll see the Ripple icon spin while it syncs — everything updates in the background automatically too.",
    accentKey: "coral",
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export function OnboardingFlow({ onComplete, replayMode }: { onComplete: () => void; replayMode?: boolean }) {
  const { theme, paletteId, setPalette } = useTheme();
  const cardBg = useCardBg();
  const ink = theme.ink;
  const { width } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(ink, theme.card, theme.cardBorder, width), [ink, theme.card, theme.cardBorder, width]);

  const [step, setStep] = useState<Step>("walkthrough");
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [loading, setLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [dexcomUsername, setDexcomUsername] = useState("");
  const [dexcomAccountId, setDexcomAccountId] = useState("");
  const [dexcomPassword, setDexcomPassword] = useState("");
  const [dexcomRegion, setDexcomRegion] = useState<"us" | "ous">("us");
  const [dexcomError, setDexcomError] = useState<string | null>(null);
  const [dexcomNeedsAccountId, setDexcomNeedsAccountId] = useState(false);
  const [dexcomConnecting, setDexcomConnecting] = useState(false);
  const [batteryRestricted, setBatteryRestricted] = useState<boolean | null>(null);

  function advance() {
    if (step === "walkthrough") setStep("theme");
    else if (step === "theme") setStep("tabs");
    else if (step === "tabs") setStep("health");
    else if (step === "health") setStep("drive");
    else if (step === "drive") { setDriveError(null); setStep("dexcom"); }
    else if (step === "dexcom") { setDexcomError(null); setStep("notifications"); }
    else if (step === "notifications") setStep("battery");
    else onComplete();
  }

  function nextPage() {
    if (page < WALK_PAGES.length - 1) {
      const next = page + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setPage(next);
    } else {
      // In replay mode, walkthrough ends here — no setup steps
      if (replayMode) { onComplete(); return; }
      setStep("theme");
    }
  }

  async function handleDriveConnect() {
    if (!GOOGLE_CLIENT_ID) {
      setDriveError("Google Drive isn't configured — connect it later from Settings.");
      return;
    }
    setLoading(true);
    setDriveError(null);
    try {
      const userId = await getUserId();
      if (!userId) {
        setDriveError("Could not determine user ID. Please log out and back in.");
        return;
      }
      const redirectUri = "https://app.kels.gg/auth/google/callback";
      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          redirect_uri: redirectUri,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/drive.file",
          access_type: "offline",
          prompt: "consent",
          state: userId,
        }).toString();

      const result = await WebBrowser.openAuthSessionAsync(authUrl, "ripple://oauth");
      if (result.type === "success" && result.url.includes("status=connected")) {
        advance();
      } else if (result.type === "success" && result.url.includes("status=error")) {
        setDriveError("Google authorization failed. Try again, or skip to connect later.");
      }
    } catch (e: any) {
      setDriveError(e?.message ?? "Failed to open Google sign-in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDexcomConnect() {
    const username = dexcomUsername.trim();
    const accountId = dexcomAccountId.trim();
    const pw = dexcomPassword.trim();

    if (dexcomNeedsAccountId) {
      if (!accountId || !pw) { setDexcomError("Enter your Account ID and Share password."); return; }
    } else {
      if (!username || !pw) { setDexcomError("Enter your Dexcom username and Share password."); return; }
    }

    setDexcomConnecting(true);
    setDexcomError(null);
    try {
      const params = dexcomNeedsAccountId
        ? { account_id: accountId, password: pw, region: dexcomRegion }
        : { username, password: pw, region: dexcomRegion };
      const result = await api.dexcomVerifyShare(params);
      if (result.ok) {
        api.glucoseSyncShare().catch(() => {});
        advance();
      } else if (result.needs_account_id) {
        setDexcomNeedsAccountId(true);
        setDexcomError(result.message ?? "This account needs an Account ID to connect.");
      } else {
        setDexcomError("Connection failed. Try again or skip to connect later from Settings.");
      }
    } catch (e: any) {
      const msg = e?.message ?? "";
      if (msg.includes("401") || msg.toLowerCase().includes("password") || msg.toLowerCase().includes("invalid")) {
        setDexcomError("Incorrect username or password. Double-check your Dexcom Share credentials.");
      } else {
        setDexcomError("Couldn't connect. Check your network and try again.");
      }
    } finally {
      setDexcomConnecting(false);
    }
  }

  async function handleHealthConnect() {
    setLoading(true);
    try { await requestHealthPermissions(); } catch { }
    finally { setLoading(false); advance(); }
  }

  async function handleNotifications() {
    setLoading(true);
    try { await notifee.requestPermission(); } catch { }
    finally { setLoading(false); advance(); }
  }

  // ── Walkthrough previews ──────────────────────────────────────────────────────

  function HomePreview() {
    return (
      <View style={styles.preview}>
        {/* Top glance chips: Mood, Glucose, Steps */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: "Mood", value: "😊", sub: "Good" },
            { label: "Glucose", value: "118", sub: "mg/dL stable" },
            { label: "Steps", value: "6,240", sub: "today" },
          ].map((item) => (
            <View key={item.label} style={[styles.glanceChip, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
              <Text style={{ fontSize: 20, textAlign: "center" }}>{item.value}</Text>
              <Text style={[styles.statChipLabel, { color: ink }]}>{item.label}</Text>
              <Text style={[styles.statChipSub, { color: theme.textSoft, textAlign: "center" }]}>{item.sub}</Text>
            </View>
          ))}
        </View>
        {/* Mini timeline strip */}
        <View style={[styles.bookCard, { backgroundColor: cardBg, borderColor: theme.cardBorder, paddingVertical: 10, gap: 6 }]}>
          {[
            { icon: "🍜", label: "Lunch", time: "12:45 pm" },
            { icon: "😊", label: "Mood", time: "2:00 pm" },
            { icon: "💧", label: "Water", time: "3:00 pm" },
          ].map((entry) => (
            <View key={entry.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 14 }}>{entry.icon}</Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: ink, flex: 1 }}>{entry.label}</Text>
              <Text style={{ fontSize: 11, color: theme.textSoft }}>{entry.time}</Text>
            </View>
          ))}
        </View>
        {/* Insight card */}
        <View style={[styles.insightCard, { backgroundColor: theme.berry.bg, borderColor: theme.berry.sub }]}>
          <Text style={{ fontSize: 16 }}>✨</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.insightTitle, { color: theme.berry.sub }]}>Glucose insight</Text>
            <Text style={[styles.insightText, { color: ink }]}>Stable after morning walks — 5 days in a row</Text>
          </View>
        </View>
        {/* Water + Sleep chips */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: "Water", value: "6 / 8 glasses", color: theme.blue?.solid ?? "#3B82F6" },
            { label: "Sleep", value: "7h 15m", color: theme.amber?.solid ?? "#F59E0B" },
          ].map((chip) => (
            <View key={chip.label} style={[styles.miniChip, { backgroundColor: cardBg, borderColor: chip.color }]}>
              <View style={[styles.miniChipDot, { backgroundColor: chip.color }]} />
              <Text style={[styles.miniChipValue, { color: ink, fontSize: 12 }]}>{chip.value}</Text>
              <Text style={[styles.statChipSub, { color: theme.textSoft }]}>{chip.label}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  function HealthPreview() {
    const chips = [
      { label: "Glucose", value: "118", unit: "mg/dL", sub: "stable", color: theme.berry.solid },
      { label: "Steps", value: "6,240", unit: "/ 8,000", sub: "today", color: theme.teal.solid },
      { label: "Sleep", value: "7h 15m", unit: "", sub: "last night", color: theme.amber?.solid ?? "#F59E0B" },
      { label: "Heart Rate", value: "64", unit: "BPM", sub: "resting", color: theme.coral.solid },
    ];
    const bars = [
      { day: "Mon", h: 28, color: theme.teal.solid },
      { day: "Tue", h: 44, color: theme.teal.solid },
      { day: "Wed", h: 36, color: theme.teal.solid },
      { day: "Thu", h: 52, color: theme.teal.solid },
    ];
    return (
      <View style={styles.preview}>
        {/* 4 stat chips in 2×2 grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {chips.map((c) => (
            <View key={c.label} style={[styles.statChip, { backgroundColor: cardBg, borderColor: c.color }]}>
              <View style={[styles.statChipDot, { backgroundColor: c.color }]} />
              <Text style={[styles.statChipValue, { color: ink }]}>
                {c.value}<Text style={styles.statChipUnit}> {c.unit}</Text>
              </Text>
              <Text style={[styles.statChipSub, { color: theme.textSoft }]}>{c.sub}</Text>
            </View>
          ))}
        </View>
        {/* Mini bar chart Mon–Thu */}
        <View style={[styles.bookCard, { backgroundColor: cardBg, borderColor: theme.cardBorder, paddingVertical: 10 }]}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: 56, justifyContent: "center" }}>
            {bars.map((b) => (
              <View key={b.day} style={{ alignItems: "center", gap: 4 }}>
                <View style={{ width: 22, height: b.h, borderRadius: 4, backgroundColor: b.color, opacity: 0.85 }} />
                <Text style={{ fontSize: 10, color: theme.textSoft, fontWeight: "600" }}>{b.day}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* TIR badge */}
        <View style={[styles.weekBadge, { backgroundColor: theme.berry.bg, borderColor: theme.berry.sub }]}>
          <Text style={{ fontSize: 15 }}>🎯</Text>
          <Text style={[styles.weekBadgeText, { color: theme.berry.sub, fontWeight: "800" }]}>TIR: 82% today</Text>
        </View>
      </View>
    );
  }

  function MealsPreview() {
    const rows = [
      { name: "Greek yogurt + granola", type: "Breakfast", cal: "280 cal", color: theme.teal.solid },
      { name: "Salmon bowl", type: "Lunch", cal: "520 cal", color: theme.coral.solid },
      { name: "Grilled chicken...", type: "Dinner", cal: "— cal", color: theme.amber?.solid ?? "#F59E0B" },
    ];
    return (
      <View style={styles.preview}>
        {/* 3 meal rows */}
        {rows.map((r) => (
          <View key={r.name} style={[styles.mealRow, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.mealDot, { backgroundColor: r.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.mealName, { color: ink }]} numberOfLines={1}>{r.name}</Text>
              <Text style={[styles.mealMeta, { color: theme.textSoft }]}>{r.type}  ·  {r.cal}</Text>
            </View>
          </View>
        ))}
        {/* Macro chips */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[
            { label: "Carbs", g: "94g", color: theme.coral.solid },
            { label: "Protein", g: "76g", color: theme.teal.solid },
            { label: "Fat", g: "32g", color: theme.amber?.solid ?? "#F59E0B" },
          ].map((m) => (
            <View key={m.label} style={[styles.macroChip, { borderColor: m.color, backgroundColor: cardBg }]}>
              <Text style={{ fontSize: 14, fontWeight: "800", color: ink }}>{m.g}</Text>
              <Text style={{ fontSize: 11, color: theme.textSoft }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {/* Caffeine badge */}
        <View style={[styles.substanceBadge, { backgroundColor: theme.coral.bg, borderColor: theme.coral.sub }]}>
          <Text style={[styles.substanceBadgeText, { color: theme.coral.sub }]}>☕ 140mg caffeine</Text>
        </View>
      </View>
    );
  }

  function HobbiesPreview() {
    return (
      <View style={styles.preview}>
        {/* Book card */}
        <View style={[styles.bookCard, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bookTitle, { color: ink }]} numberOfLines={1}>The Almanack of Naval Ravikant</Text>
              <Text style={[styles.bookAuthor, { color: theme.textSoft }]}>Eric Jorgenson</Text>
            </View>
            <Text style={{ fontSize: 22 }}>📖</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.cardBorder }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.blue?.solid ?? "#3B82F6", width: "38%" }]} />
          </View>
          <Text style={[styles.progressLabel, { color: theme.textSoft }]}>38% complete</Text>
        </View>
        {/* Guitar hobby row */}
        <View style={[styles.hobbyRow, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <View style={[styles.hobbyIcon, { backgroundColor: theme.blue?.bg ?? "#EFF6FF" }]}>
            <Text style={{ fontSize: 20 }}>🎸</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hobbyName, { color: ink }]}>Guitar</Text>
            <Text style={[styles.hobbyMeta, { color: theme.textSoft }]}>30 min today · 4 day streak 🔥</Text>
          </View>
        </View>
        {/* Running hobby row */}
        <View style={[styles.hobbyRow, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <View style={[styles.hobbyIcon, { backgroundColor: theme.teal.bg }]}>
            <Text style={{ fontSize: 20 }}>🏃</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hobbyName, { color: ink }]}>Running</Text>
            <Text style={[styles.hobbyMeta, { color: theme.textSoft }]}>4.2 km this morning</Text>
          </View>
        </View>
        {/* Journal preview */}
        <View style={[styles.insightCard, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <Text style={{ fontSize: 16 }}>📝</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.insightTitle, { color: ink }]}>Journal</Text>
            <Text style={[styles.insightText, { color: theme.textSoft }]}>Felt productive today...</Text>
          </View>
        </View>
      </View>
    );
  }

  function InsightsPreview() {
    const cards = [
      {
        icon: "🍝",
        title: "Pasta raises glucose 35+ mg/dL",
        sub: "seen 4 of last 5 times",
        bg: theme.berry.bg,
        border: theme.berry.sub,
        titleColor: theme.berry.sub,
      },
      {
        icon: "😴",
        title: "7+ hours sleep → better mood",
        sub: "9 of 12 occurrences",
        bg: (theme.violet as any)?.bg ?? theme.purple.tint,
        border: (theme.violet as any)?.sub ?? theme.purple.solid,
        titleColor: (theme.violet as any)?.sub ?? theme.purple.solid,
      },
      {
        icon: "💸",
        title: "Spending spikes on Fridays",
        sub: "avg $42 vs $18 other days",
        bg: theme.purple.tint,
        border: theme.purple.solid,
        titleColor: theme.purple.solid,
      },
    ];
    return (
      <View style={styles.preview}>
        {cards.map((ins, i) => (
          <View key={i} style={[styles.insightCard, { backgroundColor: ins.bg, borderColor: ins.border }]}>
            <Text style={{ fontSize: 18 }}>{ins.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.insightTitle, { color: ins.titleColor }]}>{ins.title}</Text>
              <Text style={[styles.insightText, { color: theme.textSoft }]}>{ins.sub}</Text>
            </View>
          </View>
        ))}
        {/* Weekly Wrap banner */}
        <View style={[styles.weekBadge, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <Text style={{ fontSize: 16 }}>📊</Text>
          <Text style={[styles.weekBadgeText, { color: ink }]}>Weekly Wrap — tap to review your trends</Text>
        </View>
      </View>
    );
  }

  function FinancePreview() {
    const purple = theme.purple?.solid ?? "#7B3FBF";
    return (
      <View style={styles.preview}>
        {/* Budget card with progress bar */}
        <View style={[styles.bookCard, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.bookTitle, { color: ink }]}>Monthly Budget</Text>
            <Text style={[styles.bookAuthor, { color: theme.textSoft }]}>$1,180 / $2,000</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.cardBorder, marginTop: 10 }]}>
            <View style={[styles.progressFill, { backgroundColor: purple, width: "59%" }]} />
          </View>
          <Text style={[styles.progressLabel, { color: theme.textSoft }]}>59% used · $820 remaining</Text>
        </View>
        {/* Category rows */}
        {[
          { cat: "Groceries", amt: "$340", color: theme.teal.solid },
          { cat: "Dining Out", amt: "$195", color: theme.coral.solid },
          { cat: "Transport", amt: "$145", color: theme.amber?.solid ?? "#F59E0B" },
          { cat: "Entertainment", amt: "$85", color: purple },
        ].map((row) => (
          <View key={row.cat} style={[styles.mealRow, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.categoryDot, { backgroundColor: row.color }]} />
            <Text style={[styles.mealName, { color: ink, flex: 1 }]}>{row.cat}</Text>
            <Text style={[styles.mealName, { color: ink }]}>{row.amt}</Text>
          </View>
        ))}
        {/* Mood correlation badge */}
        <View style={[styles.weekBadge, { backgroundColor: theme.purple.tint, borderColor: purple }]}>
          <Text style={{ fontSize: 15 }}>💡</Text>
          <Text style={[styles.weekBadgeText, { color: purple, fontWeight: "700" }]}>Spending up on low-mood days</Text>
        </View>
      </View>
    );
  }

  function ExercisePreview() {
    const sessions = [
      { name: "Morning Run", meta: "5.2 km · 32 min", icon: "🏃", color: theme.berry.solid },
      { name: "Upper Body", meta: "45 min · 6 sets", icon: "🏋️", color: theme.berry.solid },
    ];
    return (
      <View style={styles.preview}>
        {sessions.map((s) => (
          <View key={s.name} style={[styles.mealRow, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.hobbyIcon, { backgroundColor: theme.berry.bg }]}>
              <Text style={{ fontSize: 20 }}>{s.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mealName, { color: theme.ink }]}>{s.name}</Text>
              <Text style={[styles.mealMeta, { color: theme.textSoft }]}>{s.meta}</Text>
            </View>
          </View>
        ))}
        <View style={[styles.bookCard, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
          <View style={{ flexDirection: "row", gap: 14, justifyContent: "center" }}>
            {[
              { label: "This week", val: "3", unit: "sessions" },
              { label: "Active time", val: "1h 47m", unit: "total" },
              { label: "Streak", val: "5", unit: "days 🔥" },
            ].map((stat) => (
              <View key={stat.label} style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "900", color: theme.berry.solid }}>{stat.val}</Text>
                <Text style={{ fontSize: 10, color: theme.textSoft }}>{stat.unit}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.weekBadge, { backgroundColor: theme.berry.bg, borderColor: theme.berry.sub }]}>
          <Text style={{ fontSize: 15 }}>📉</Text>
          <Text style={[styles.weekBadgeText, { color: theme.berry.sub }]}>Resting HR down 4 bpm this week</Text>
        </View>
      </View>
    );
  }

  function FriendsPreview() {
    const friends = [
      { name: "Jordan", steps: "9,210", mood: "😊", rank: 1 },
      { name: "Sam", steps: "7,840", mood: "🙂", rank: 2 },
      { name: "You", steps: "6,240", mood: "😄", rank: 3, isYou: true },
    ];
    return (
      <View style={styles.preview}>
        {friends.map((f) => (
          <View key={f.name} style={[styles.mealRow, { backgroundColor: f.isYou ? theme.teal.bg : theme.card, borderColor: f.isYou ? theme.teal.solid : theme.cardBorder }]}>
            <Text style={{ fontSize: 16, fontWeight: "900", width: 22, color: theme.teal.solid }}>#{f.rank}</Text>
            <Text style={{ fontSize: 20, marginHorizontal: 4 }}>{f.mood}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mealName, { color: ink }]}>{f.name}{f.isYou ? " (you)" : ""}</Text>
              <Text style={[styles.mealMeta, { color: theme.textSoft }]}>{f.steps} steps today</Text>
            </View>
          </View>
        ))}
        <View style={[styles.insightCard, { backgroundColor: theme.teal.bg, borderColor: theme.teal.sub }]}>
          <Text style={{ fontSize: 16 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.insightTitle, { color: theme.teal.sub }]}>Step Challenge</Text>
            <Text style={[styles.insightText, { color: ink }]}>3 days left · you're 970 steps from 2nd place</Text>
          </View>
        </View>
      </View>
    );
  }

  function GesturesPreview() {
    return (
      <View style={styles.preview}>
        {[
          { gesture: "Long-hold chip", desc: "Log water, mood, or meals in one tap — no navigation needed", icon: "👇", color: theme.amber.solid },
          { gesture: "Double-tap insight", desc: "Pin any insight card to the top of your feed", icon: "❤️", color: theme.coral.solid },
          { gesture: "Tap tile header", desc: "Open the detail screen for steps, glucose, heart rate, and more", icon: "↗️", color: theme.teal.solid },
          { gesture: "Header buttons", desc: "INSIGHT, FRIENDS, SEARCH, and SETTINGS always in the top-right corner", icon: "⚙️", color: theme.berry.solid },
        ].map((item) => (
          <View key={item.gesture} style={[styles.mealRow, { backgroundColor: cardBg, borderColor: theme.cardBorder }]}>
            <View style={[styles.hobbyIcon, { backgroundColor: theme.amber.bg, width: 36, height: 36, borderRadius: 18 }]}>
              <Text style={{ fontSize: 17 }}>{item.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.mealName, { color: ink, fontSize: 13 }]}>{item.gesture}</Text>
              <Text style={[styles.mealMeta, { color: theme.textSoft }]}>{item.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  }

  function RefreshPreview() {
    return (
      <View style={styles.preview}>
        <View style={[styles.bookCard, { backgroundColor: cardBg, borderColor: theme.cardBorder, alignItems: "center", paddingVertical: 18 }]}>
          <View style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: theme.cardBorder, alignItems: "center", justifyContent: "center", marginBottom: 10, backgroundColor: theme.page }}>
            <Text style={{ fontSize: 26 }}>💧</Text>
          </View>
          <Text style={{ fontWeight: "700", color: ink, fontSize: 14 }}>Pull down to refresh</Text>
          <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 4 }}>The Ripple icon spins while syncing</Text>
        </View>
        <View style={[styles.insightCard, { backgroundColor: theme.coral.bg, borderColor: theme.coral.sub }]}>
          <Text style={{ fontSize: 16 }}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.insightTitle, { color: theme.coral.sub }]}>Background sync</Text>
            <Text style={[styles.insightText, { color: ink }]}>Data refreshes automatically every few minutes — pull down any time for an instant update</Text>
          </View>
        </View>
        {[
          { icon: "🍜", label: "Meals auto-sync after logging" },
          { icon: "📡", label: "Glucose checks every 5 min" },
          { icon: "🏃", label: "Steps refresh from Health Connect" },
        ].map((item) => (
          <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 16 }}>{item.icon}</Text>
            <Text style={{ color: theme.textStrong, fontSize: 13 }}>{item.label}</Text>
          </View>
        ))}
      </View>
    );
  }

  // ── Walkthrough screen ────────────────────────────────────────────────────────

  if (step === "walkthrough") {
    const previews: React.ReactNode[] = [
      <HomePreview key="home" />,
      <HealthPreview key="health" />,
      <MealsPreview key="meals" />,
      <HobbiesPreview key="hobbies" />,
      <InsightsPreview key="insights" />,
      <FinancePreview key="finance" />,
      <ExercisePreview key="exercise" />,
      <FriendsPreview key="friends" />,
      <GesturesPreview key="gestures" />,
      <RefreshPreview key="refresh" />,
    ];

    return (
      <View style={[styles.screen, { backgroundColor: theme.page }]}>
        <View style={styles.topBar}>
          <Pressable
            onPress={() => replayMode ? onComplete() : setStep("theme")}
            hitSlop={12}
            style={styles.skipTouchable}
          >
            <Text style={[styles.skipText, { color: theme.textSoft }]}>
              {replayMode ? "Close" : "Skip tour"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.dots}>
          {WALK_PAGES.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === page ? ink : theme.cardBorder, width: i === page ? 22 : 8 }]} />
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={32}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {WALK_PAGES.map((p, i) => {
            const accent = theme[p.accentKey] as any;
            return (
              <ScrollView key={i} style={{ width }} contentContainerStyle={styles.walkthroughPage} showsVerticalScrollIndicator={false}>
                <View style={[styles.bigEmojiBlock, { backgroundColor: accent.bg, borderColor: ink }]}>
                  <Text style={styles.bigEmoji}>{p.emoji}</Text>
                </View>
                <Text style={[styles.pageLabel, { color: accent.sub }]}>{p.label}</Text>
                <Text style={[styles.pageDesc, { color: theme.textStrong }]}>{p.desc}</Text>
                {previews[i] ?? null}
              </ScrollView>
            );
          })}
        </ScrollView>

        <View style={[styles.bottom, { borderTopColor: theme.cardBorder }]}>
          <Pressable style={[styles.primaryBtn, { backgroundColor: ink, borderColor: ink }]} onPress={nextPage}>
            <Text style={[styles.primaryBtnText, { color: theme.page }]}>
              {page === WALK_PAGES.length - 1 ? "Get started  →" : "Next  →"}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Theme picker step ─────────────────────────────────────────────────────────

  if (step === "theme") {
    const currentPalette = PALETTES[paletteId];
    return (
      <View style={[styles.screen, { backgroundColor: theme.page }]}>
        <View style={styles.themeHeader}>
          <Text style={[styles.stepTitle, { color: ink }]}>Choose your look</Text>
          <Text style={[styles.themeSubtitle, { color: theme.textSoft }]}>
            Change any time from Settings → Appearance
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.themeGrid} showsVerticalScrollIndicator={false}>
          {Object.entries(PALETTE_GROUPS).map(([group, ids]) => (
            <View key={group}>
              <Text style={[styles.themeGroupLabel, { color: theme.textSoft }]}>{group.toUpperCase()}</Text>
              <View style={styles.themeRow}>
                {ids.map((id) => {
                  const p = PALETTES[id];
                  const selected = id === paletteId;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setPalette(id)}
                      style={[
                        styles.themeCard,
                        { backgroundColor: p.card, borderColor: selected ? p.teal.solid : p.cardBorder },
                        selected && { borderWidth: 3 },
                      ]}
                    >
                      <View style={styles.swatchRow}>
                        {[p.ink, p.page, p.teal.solid, p.coral.solid, p.berry.solid].map((c, ci) => (
                          <View key={ci} style={[styles.swatch, { backgroundColor: c }]} />
                        ))}
                      </View>
                      <Text style={[styles.themeCardName, { color: p.ink }]} numberOfLines={1}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.bottom, { borderTopColor: theme.cardBorder }]}>
          <Pressable style={[styles.primaryBtn, { backgroundColor: theme.teal.solid, borderColor: ink }]} onPress={advance}>
            <Text style={styles.primaryBtnText}>Use {currentPalette?.name ?? "this theme"}  →</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Tabs picker step ──────────────────────────────────────────────────────────

  if (step === "tabs") {
    return (
      <View style={[styles.screen, { backgroundColor: theme.page }]}>
        <TabPreferencesScreen mode="onboarding" onDone={advance} />
      </View>
    );
  }

  // ── Integration step configs ──────────────────────────────────────────────────

  type StepCfg = {
    emoji: string;
    accentKey: AccentKey;
    title: string;
    body: React.ReactNode;
    primaryLabel: string;
    primaryAction: () => void;
    skipLabel?: string;
  };

  async function handleBatteryOptimization() {
    try {
      await IntentLauncher.startActivityAsync(
        "android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
        { data: "package:com.kellehs.wellness" }
      );
      const restricted = await notifee.isBatteryOptimizationEnabled();
      setBatteryRestricted(restricted);
    } catch {
      advance();
    }
  }

  const stepCfg: Record<Exclude<Step, "walkthrough" | "theme" | "tabs">, StepCfg> = {
    drive: {
      emoji: "🗂️",
      accentKey: "teal",
      title: "Back up your data",
      body: (
        <>
          <Text style={[styles.stepDesc, { color: theme.textStrong }]}>
            Ripple can automatically back up your glucose, meals, mood, spending, and more to{" "}
            <Text style={{ fontWeight: "700" }}>your own Google Drive</Text> so you never lose your history.
          </Text>
          <View style={[styles.disclosureBox, { backgroundColor: theme.page, borderColor: ink }]}>
            <Text style={[styles.disclosureLabel, { color: theme.textSoft }]}>IF YOU SKIP</Text>
            <Text style={[styles.disclosureText, { color: theme.textStrong }]}>
              Automatic backups won't happen. You can export manually at any time from Settings.
            </Text>
          </View>
          {driveError ? <Text style={[styles.errorText, { color: theme.danger }]}>{driveError}</Text> : null}
        </>
      ),
      primaryLabel: "Connect Google Drive",
      primaryAction: handleDriveConnect,
    },
    dexcom: {
      emoji: "📡",
      accentKey: "berry",
      title: "Connect Dexcom CGM",
      body: (
        <>
          <Text style={[styles.stepDesc, { color: theme.textStrong }]}>
            Connect your Dexcom Share account to see live glucose readings in Ripple.
          </Text>

          {!dexcomNeedsAccountId ? (
            <>
              <Text style={[styles.inputLabel, { color: ink }]}>Dexcom Username or Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: cardBg, borderColor: theme.cardBorder, color: theme.textStrong }]}
                value={dexcomUsername}
                onChangeText={setDexcomUsername}
                placeholder="username or email"
                placeholderTextColor={theme.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : (
            <>
              <View style={[styles.disclosureBox, { backgroundColor: theme.page, borderColor: ink, marginTop: 12 }]}>
                <Text style={[styles.disclosureLabel, { color: theme.textSoft }]}>ACCOUNT ID NEEDED</Text>
                <Text style={[styles.disclosureText, { color: theme.textStrong }]}>
                  Standard login didn't work for this account. Enter your Account ID instead — find it at myaccount.dexcom.com under your profile.
                </Text>
              </View>
              <Text style={[styles.inputLabel, { color: ink }]}>Account ID (UUID)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: cardBg, borderColor: theme.cardBorder, color: theme.textStrong }]}
                value={dexcomAccountId}
                onChangeText={setDexcomAccountId}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                placeholderTextColor={theme.textSoft}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          <Text style={[styles.inputLabel, { color: ink }]}>Share Password</Text>
          <TextInput
            style={[styles.input, { backgroundColor: cardBg, borderColor: theme.cardBorder, color: theme.textStrong }]}
            value={dexcomPassword}
            onChangeText={setDexcomPassword}
            placeholder="Dexcom Share password"
            placeholderTextColor={theme.textSoft}
            secureTextEntry
          />

          <View style={styles.regionToggle}>
            {(["us", "ous"] as const).map((r) => (
              <Pressable
                key={r}
                onPress={() => setDexcomRegion(r)}
                style={[styles.regionBtn, { borderColor: ink, backgroundColor: dexcomRegion === r ? ink : theme.card }]}
              >
                <Text style={[styles.regionBtnText, { color: dexcomRegion === r ? theme.page : ink }]}>
                  {r === "us" ? "United States" : "Outside US"}
                </Text>
              </Pressable>
            ))}
          </View>

          {dexcomError ? <Text style={[styles.errorText, { color: theme.danger }]}>{dexcomError}</Text> : null}
        </>
      ),
      primaryLabel: dexcomConnecting ? "Connecting…" : "Connect",
      primaryAction: handleDexcomConnect,
    },
    health: {
      emoji: "🏃",
      accentKey: "teal",
      title: "Connect Health Connect",
      body: (
        <>
          <Text style={[styles.stepDesc, { color: theme.textStrong }]}>
            Automatically sync steps, sleep, and heart rate from Android's Health Connect.
          </Text>
          <View style={{ marginTop: 14, gap: 10 }}>
            {[
              "Steps — daily totals and week-over-week trends",
              "Sleep — duration and schedule",
              "Heart rate — resting BPM and daily patterns",
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View style={[styles.bulletDot, { backgroundColor: theme.teal.solid }]} />
                <Text style={[styles.bulletText, { color: theme.textStrong }]}>{item}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.stepDescSmall, { color: theme.textSoft, marginTop: 14 }]}>
            Android will open a system permissions dialog. You choose exactly what to allow.
          </Text>
        </>
      ),
      primaryLabel: "Connect Health Connect",
      primaryAction: handleHealthConnect,
    },
    notifications: {
      emoji: "🔔",
      accentKey: "amber",
      title: "Stay in the loop",
      body: (
        <>
          <Text style={[styles.stepDesc, { color: theme.textStrong }]}>Notifications are used for:</Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {[
              "Smart mood check-ins — a nudge in the afternoon and evening if you haven't logged yet",
              "Meal, water, and streak reminders — data-aware nudges, never more than once per window",
              "An optional persistent notification showing live glucose and step count",
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View style={[styles.bulletDot, { backgroundColor: theme.amber.solid }]} />
                <Text style={[styles.bulletText, { color: theme.textStrong }]}>{item}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.stepDescSmall, { color: theme.textSoft, marginTop: 16 }]}>
            All reminders can be individually enabled or disabled from Settings at any time.
          </Text>
        </>
      ),
      primaryLabel: "Enable notifications",
      primaryAction: handleNotifications,
    },
    battery: {
      emoji: "🔋",
      accentKey: "teal",
      title: "Keep Ripple running",
      body: (
        <>
          <Text style={[styles.stepDesc, { color: theme.textStrong }]}>
            Android's battery optimisation can delay or block background syncing — stopping glucose updates and reminders from arriving on time.
          </Text>
          <View style={{ marginTop: 14, gap: 10 }}>
            {[
              "Live glucose checks every 5 minutes",
              "Mood and water reminders at the right time",
              "Always-on tracking notification (if enabled)",
            ].map((item, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <View style={[styles.bulletDot, { backgroundColor: theme.teal.solid }]} />
                <Text style={[styles.bulletText, { color: theme.textStrong }]}>{item}</Text>
              </View>
            ))}
          </View>
          {batteryRestricted === false && (
            <View style={[styles.disclosureBox, { backgroundColor: theme.page, borderColor: theme.teal.solid, marginTop: 14 }]}>
              <Text style={[styles.disclosureLabel, { color: theme.teal.solid }]}>✓ EXEMPT — YOU'RE ALL SET</Text>
              <Text style={[styles.disclosureText, { color: theme.textStrong }]}>
                Ripple is already excluded from battery optimisation.
              </Text>
            </View>
          )}
          {batteryRestricted === true && (
            <View style={[styles.disclosureBox, { backgroundColor: theme.page, borderColor: theme.cardBorder, marginTop: 14 }]}>
              <Text style={[styles.disclosureLabel, { color: theme.textSoft }]}>⚠ STILL RESTRICTED</Text>
              <Text style={[styles.disclosureText, { color: theme.textStrong }]}>
                Find Ripple in the list and tap "Don't optimise" to allow background activity.
              </Text>
            </View>
          )}
        </>
      ),
      primaryLabel: batteryRestricted === false ? "Continue  →" : "Open battery settings",
      primaryAction: batteryRestricted === false ? advance : handleBatteryOptimization,
    },
  };

  const cfg = stepCfg[step as Exclude<Step, "walkthrough" | "theme" | "tabs">];
  const accent = theme[cfg.accentKey] as any;

  return (
    <View style={[styles.screen, { backgroundColor: theme.page }]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.stepCard, { backgroundColor: cardBg, borderColor: ink }]}>
          <View style={[styles.stepEmojiBlock, { backgroundColor: accent.bg, borderColor: ink }]}>
            <Text style={styles.stepEmoji}>{cfg.emoji}</Text>
          </View>
          <Text style={[styles.stepTitle, { color: theme.textStrong }]}>{cfg.title}</Text>
          {cfg.body}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { borderTopColor: theme.cardBorder }]}>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: accent.solid, borderColor: ink }]}
          onPress={cfg.primaryAction}
          disabled={loading || dexcomConnecting}
        >
          {loading || dexcomConnecting ? <LoadingIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{cfg.primaryLabel}</Text>}
        </Pressable>
        <Pressable
          style={[styles.secondaryBtn, { backgroundColor: cardBg, borderColor: ink }]}
          onPress={advance}
          disabled={loading || dexcomConnecting}
        >
          <Text style={[styles.secondaryBtnText, { color: ink }]}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function makeStyles(ink: string, card: string, cardBorder: string, _width: number) {
  const shadow = {
    shadowColor: "rgba(60,40,20,0.1)",
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1 as const,
    shadowRadius: 0,
    elevation: 6,
  };

  return StyleSheet.create({
    screen: { flex: 1, paddingTop: 52 },

    // ── Walkthrough ──
    topBar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 20, paddingBottom: 6 },
    skipTouchable: { padding: 8 },
    skipText: { fontSize: 14 },
    dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6, paddingBottom: 20 },
    dot: { height: 8, borderRadius: 4 },
    walkthroughPage: { paddingHorizontal: 28, alignItems: "center", paddingBottom: 24 },
    bigEmojiBlock: { width: 110, height: 110, borderRadius: 28, borderWidth: 3, alignItems: "center", justifyContent: "center", marginBottom: 24, ...shadow },
    bigEmoji: { fontSize: 50 },
    pageLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginBottom: 8, textTransform: "uppercase" },
    pageDesc: { fontSize: 16, fontWeight: "500", textAlign: "center", lineHeight: 25, marginBottom: 20 },

    // ── Preview: shared ──
    preview: { width: "100%", gap: 10 },

    // ── Preview: Home glance chips ──
    glanceChip: { flex: 1, borderRadius: 22, borderWidth: 1.5, padding: 10, alignItems: "center", gap: 3 },
    miniChip: { flex: 1, flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1.5, padding: 10, gap: 8 },
    miniChipDot: { width: 8, height: 8, borderRadius: 4 },
    miniChipValue: { fontSize: 14, fontWeight: "800", flex: 1 },

    // ── Preview: Health stat chips ──
    statChip: { flex: 1, minWidth: "45%", borderRadius: 22, borderWidth: 2, padding: 12, gap: 2 },
    statChipDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 4 },
    statChipLabel: { fontSize: 12, fontWeight: "700" },
    statChipValue: { fontSize: 18, fontWeight: "800" },
    statChipUnit: { fontSize: 12, fontWeight: "500" },
    statChipSub: { fontSize: 11 },

    // ── Preview: Meal rows ──
    mealRow: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
    mealDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
    mealName: { fontSize: 14, fontWeight: "700" },
    mealMeta: { fontSize: 12, marginTop: 2 },
    macroChip: { flex: 1, borderRadius: 12, borderWidth: 1.5, padding: 8, alignItems: "center", gap: 2 },
    substanceBadge: { alignSelf: "flex-start", borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
    substanceBadgeText: { fontSize: 13, fontWeight: "700" },

    // ── Preview: Hobbies / Books ──
    bookCard: { borderRadius: 22, borderWidth: 1, padding: 14, gap: 4 },
    bookTitle: { fontSize: 14, fontWeight: "800" },
    bookAuthor: { fontSize: 12, marginBottom: 8 },
    progressTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
    progressFill: { height: 6, borderRadius: 3 },
    progressLabel: { fontSize: 11, marginTop: 4 },
    hobbyRow: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 12, gap: 12 },
    hobbyIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    hobbyName: { fontSize: 14, fontWeight: "700" },
    hobbyMeta: { fontSize: 12, marginTop: 2 },

    // ── Preview: Insights ──
    insightCard: { flexDirection: "row", alignItems: "flex-start", borderRadius: 22, borderWidth: 1.5, padding: 12, gap: 10 },
    insightTitle: { fontSize: 13, fontWeight: "800", marginBottom: 2 },
    insightText: { fontSize: 12, lineHeight: 18 },
    weekBadge: { flexDirection: "row", alignItems: "center", borderRadius: 16, borderWidth: 1, padding: 10, gap: 10 },
    weekBadgeText: { fontSize: 12, fontWeight: "600", flex: 1 },

    // ── Preview: Finance ──
    categoryDot: { width: 12, height: 12, borderRadius: 8, flexShrink: 0 },

    // ── Theme picker ──
    themeHeader: { paddingHorizontal: 24, paddingBottom: 16 },
    themeSubtitle: { fontSize: 14, marginTop: 6 },
    themeGrid: { paddingHorizontal: 20, paddingBottom: 24, gap: 20 },
    themeGroupLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 10 },
    themeRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    themeCard: { width: "46%", borderRadius: 22, borderWidth: 2, padding: 12, gap: 8 },
    swatchRow: { flexDirection: "row", gap: 4 },
    swatch: { flex: 1, height: 14, borderRadius: 4 },
    themeCardName: { fontSize: 13, fontWeight: "700" },

    // ── Shared bottom ──
    bottom: { padding: 20, gap: 12, borderTopWidth: 1 },
    primaryBtn: { borderRadius: 26, borderWidth: 2, paddingVertical: 15, alignItems: "center", shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
    primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15, letterSpacing: 0.2 },
    secondaryBtn: { borderRadius: 26, borderWidth: 2, paddingVertical: 13, alignItems: "center", shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
    secondaryBtnText: { fontWeight: "800", fontSize: 15, letterSpacing: 0.2 },

    // ── Integration step card ──
    stepCard: { margin: 20, borderRadius: 16, borderWidth: 2, padding: 24, ...shadow },
    stepEmojiBlock: { width: 88, height: 88, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 20, alignSelf: "center", shadowColor: "rgba(60,40,20,0.1)", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 4 },
    stepEmoji: { fontSize: 40 },
    stepTitle: { fontSize: 24, fontWeight: "900", letterSpacing: -0.8, textAlign: "center", marginBottom: 16 },
    stepDesc: { fontSize: 15, lineHeight: 24 },
    stepDescSmall: { fontSize: 13, lineHeight: 20 },

    // ── Dexcom inputs ──
    inputLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 14, marginBottom: 6 },
    input: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    regionToggle: { flexDirection: "row", gap: 10, marginTop: 14 },
    regionBtn: { flex: 1, borderRadius: 16, borderWidth: 2, paddingVertical: 10, alignItems: "center" },
    regionBtnText: { fontWeight: "700", fontSize: 14 },

    // ── Disclosure box ──
    disclosureBox: { marginTop: 16, borderRadius: 22, borderWidth: 2, padding: 14, gap: 4 },
    disclosureLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase" },
    disclosureText: { fontSize: 13, lineHeight: 20, fontWeight: "500" },

    errorText: { fontSize: 13, marginTop: 10, lineHeight: 19 },
    bulletDot: { width: 7, height: 7, borderRadius: 4, marginTop: 7, flexShrink: 0 },
    bulletText: { flex: 1, fontSize: 15, lineHeight: 23 },
  });
}
