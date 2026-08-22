import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import Svg, { Rect, Line } from "react-native-svg";
import { FeatureIntroSheet } from "../components/FeatureIntroSheet";
import { useFeatureIntro } from "../onboarding/useFeatureIntro";
import { findIntro } from "../onboarding/featureIntros";
import {
  ScrollView, View, Text, TextInput, Pressable, StyleSheet,
  RefreshControl, Alert, Modal, KeyboardAvoidingView, Platform,
  TouchableWithoutFeedback, Keyboard, Animated,
} from "react-native";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { coloredShadow, layeredShadow } from "../theme/styleUtils";
import { ShadowCard } from "../components/ShadowCard";
import { IconBadge } from "../components/IconBadge";
import { api } from "../api/client";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { toast } from "../lib/toast";
import { TooltipBubble } from "../components/TooltipBubble";
import { hasSeenTooltip, markTooltipSeen } from "../utils/tooltipSeen";
import { SectionEditorModal, SectionDef } from "../components/SectionEditorModal";
import { FeatureTour, TourStep } from "../components/FeatureTour";
import AsyncStorage from "@react-native-async-storage/async-storage";
import notifee from "../lib/notifeeSafe";
import { CH_SPENDING } from "../lib/smartNotifications";
import { ScreenBackground } from "../components/ScreenBackground";
import { formatDayHeader, formatTime, todayStr } from "../utils/dateUtils";
import { getCached, setCached, invalidateCache } from "../utils/staleCache";
import { isReducedMotion } from "../lib/motion";
import { CountUpText } from "../components/CountUpText";

const FINANCE_SECTIONS: SectionDef[] = [
  { id: 'totals',       label: 'Total spent',              description: 'Spending total card with add button' },
  { id: 'breakdown',    label: 'Where it went',             description: 'Category breakdown bar chart' },
  { id: 'mood_suggest', label: 'Spending-mood suggestion',  description: 'Banner linking spend to nearby mood entries' },
];

type SpendingEntry = {
  id: string;
  amount: number;
  category: string | null;
  merchant_name: string | null;
  notes: string | null;
  source: string | null;
  plaid_transaction_id: string | null;
  logged_at: string;
  tag: string | null;
};

const CATEGORIES = [
  "Food & Dining",
  "Shopping",
  "Entertainment",
  "Personal Care",
  "Transport",
  "Health",
  "Subscriptions",
  "Home",
  "Rent / Mortgage",
  "Utilities",
  "Other",
];


function normalizeCategory(cat: string | null): string {
  if (!cat) return "Other";
  const map: Record<string, string> = {
    "food":              "Food & Dining",
    "food & dining":     "Food & Dining",
    "transport":         "Transport",
    "health":            "Health",
    "shopping":          "Shopping",
    "entertainment":     "Entertainment",
    "subscriptions":     "Subscriptions",
    "subscription":      "Subscriptions",
    "personal care":     "Personal Care",
    "personal_care":     "Personal Care",
    "home":              "Home",
    "other":             "Other",
    "income / transfer": "Other",
  };
  return map[cat.toLowerCase()] ?? cat;
}

function formatAmount(n: number): string {
  return "$" + Number(n).toFixed(2);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function localDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}


function groupByDay(entries: SpendingEntry[]): [string, SpendingEntry[]][] {
  const map: Record<string, SpendingEntry[]> = {};
  for (const e of entries) {
    const day = localDateStr(e.logged_at);
    (map[day] ??= []).push(e);
  }
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
}

// ─────────────────────────────────────────────────────────────────────────────

function FinanceEmptyState({ onAdd }: { onAdd: () => void }) {
  const { theme } = useTheme();
  const c = theme.purple.solid;
  return (
    <View style={{ alignItems: "center", paddingVertical: 48 }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: theme.purple.tint,
        borderWidth: 1.5, borderColor: theme.purple.solid + "40",
        alignItems: "center", justifyContent: "center",
      }}>
        <Ionicons name="wallet-outline" size={34} color={theme.purple.solid} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: "700", color: theme.textStrong, marginTop: 16 }}>No spending logged this month</Text>
      <Text style={{ fontSize: 13, color: theme.textSoft, marginTop: 6, textAlign: "center", maxWidth: 240 }}>
        Add your first transaction to start tracking where it goes
      </Text>
      <Pressable
        onPress={() => { Haptics.selectionAsync(); onAdd(); }}
        style={{ marginTop: 20, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22, borderWidth: 2, borderColor: theme.ink, backgroundColor: c }}
        accessibilityRole="button"
      >
        <Text style={{ fontWeight: "700", color: "#fff" }}>Log an expense</Text>
      </Pressable>
    </View>
  );
}

export function FinanceScreen() {
  const { theme } = useTheme();
  const financeIntro = findIntro("finance")!;
  const [introVisible, dismissIntro] = useFeatureIntro(financeIntro.key);
  const ink = theme.ink;

  const getCategoryColor = (cat: string): string => {
    const lower = cat.toLowerCase();
    if (lower.includes("food") || lower.includes("dining") || lower.includes("grocer") || lower.includes("restaurant")) return theme.finance.food;
    if (lower.includes("transport") || lower.includes("travel") || lower.includes("uber") || lower.includes("gas")) return theme.finance.transport;
    if (lower.includes("shop") || lower.includes("cloth") || lower.includes("amazon")) return theme.finance.shopping;
    if (lower.includes("health") || lower.includes("medic") || lower.includes("pharma") || lower.includes("gym")) return theme.finance.health;
    if (lower.includes("entertain") || lower.includes("movie") || lower.includes("music") || lower.includes("netflix") || lower.includes("stream") || lower.includes("subscri")) return theme.finance.entertainment;
    if (lower.includes("util") || lower.includes("bill") || lower.includes("electric") || lower.includes("water") || lower.includes("rent") || lower.includes("phone") || lower.includes("home") || lower.includes("mortg")) return theme.finance.utilities;
    if (lower.includes("personal") || lower.includes("care")) return theme.finance.other;
    return theme.finance.other;
  };

  const [hiddenSections, setHiddenSections] = useState<string[]>([]);
  const [showSectionEditor, setShowSectionEditor] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourPadding, setTourPadding] = useState(0);
  const tourTotalsRef = useRef<View>(null);
  const tourBreakdownRef = useRef<View>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const spendingCardScale = useRef(new Animated.Value(1)).current;
  const barAnims = useRef<Animated.Value[]>([]);

  const FINANCE_TOUR: TourStep[] = [
    { ref: tourTotalsRef,    title: "Spending Total", body: "Switch between Today and This Week. Tap the + button to log a new expense. Plaid users see transactions sync automatically." },
    { ref: tourBreakdownRef, title: "Where It Went",  body: "Your spending broken down by category with proportional bars. Categories are editable on each transaction." },
  ];
  const [entries, setEntries] = useState<SpendingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState<"day" | "week">("week");

  const [showAdd, setShowAdd] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [addCategory, setAddCategory] = useState("Food & Dining");
  const [addMerchant, setAddMerchant] = useState("");
  const [addDate, setAddDate] = useState(todayStr());
  const [addNotes, setAddNotes] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);

  const [editEntry, setEditEntry] = useState<SpendingEntry | null>(null);
  const [editCategory, setEditCategory] = useState("");
  const [moodSuggestion, setMoodSuggestion] = useState<{ spending_id: string; amount: number; merchant_name: string | null; mood_label: string } | null>(null);
  const [heatmapSelectedDay, setHeatmapSelectedDay] = useState<string | null>(null);
  // Month navigation for heatmap (0 = current month, -1 = last month, etc.)
  const [heatmapMonthOffset, setHeatmapMonthOffset] = useState(0);
  const [dailyBudget, setDailyBudget] = useState(100);
  const [editNotes, setEditNotes] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  async function load(isRefresh = false) {
    if (!isRefresh) {
      const cached = getCached<{ entries: SpendingEntry[]; suggestion: typeof moodSuggestion }>('finance:spending');
      if (cached) {
        setEntries(cached.entries);
        if (cached.suggestion?.spending_id) setMoodSuggestion(cached.suggestion);
        setLoading(false);
        return;
      }
    }
    if (isRefresh) setRefreshing(true);
    else if (!entries.length) setLoading(true);
    try {
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const [data, suggestion] = await Promise.all([
        api.spending(since),
        api.spendingMoodSuggest().catch(() => null),
      ]);
      const entryList = Array.isArray(data) ? data : [];
      const sug = (suggestion && suggestion.spending_id) ? suggestion : null;
      setCached('finance:spending', { entries: entryList, suggestion: sug });
      setEntries(entryList);
      if (sug) {
        setMoodSuggestion(sug);
      }
    } catch {
      toast("Couldn't load spending.", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function syncPlaid() {
    setSyncing(true);
    try {
      await api.plaidSync();
      await load();
    } catch {
      // silent — pull to refresh recovers
    } finally {
      setSyncing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      hasSeenTooltip("finance").then(seen => {
        if (!cancelled && !seen) {
          setShowTooltip(true);
          markTooltipSeen("finance");
        }
      });
      let tourTimer: ReturnType<typeof setTimeout> | undefined;
      hasSeenTooltip("finance-tour").then(seen => {
        if (!cancelled && !seen) { markTooltipSeen("finance-tour"); tourTimer = setTimeout(() => setShowTour(true), 600); }
      });
      api.getSettings().then((s: any) => {
        if (!cancelled) {
          setHiddenSections(s?.finance_hidden_sections ?? []);
          setDailyBudget(s?.smart_notifications?.spending_alerts?.daily_budget ?? 100);
        }
      }).catch(() => {});
      load();
      syncPlaid();
      return () => { cancelled = true; if (tourTimer) clearTimeout(tourTimer); };
    }, [])
  );

  async function handleSaveSections(newHidden: string[]) {
    setHiddenSections(newHidden);
    setShowSectionEditor(false);
    try { await api.patchSettings({ finance_hidden_sections: newHidden }); } catch (_) {}
  }

  const viewStart = view === "day" ? startOfToday() : startOfWeek();

  const filtered = useMemo(
    () => entries.filter((e) => new Date(e.logged_at) >= viewStart),
    [entries, view]
  );

  const total = useMemo(
    () => filtered.reduce((s, e) => s + Number(e.amount), 0),
    [filtered]
  );

  const lastWeekTotal = useMemo(() => {
    const thisWeekStart = startOfWeek();
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    return entries
      .filter(e => { const d = new Date(e.logged_at); return d >= lastWeekStart && d < thisWeekStart; })
      .reduce((s, e) => s + Number(e.amount), 0);
  }, [entries]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of filtered) {
      const cat = normalizeCategory(e.category);
      map[cat] = (map[cat] ?? 0) + Number(e.amount);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered]);

  const maxCat = categoryTotals[0]?.[1] ?? 1;
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  const monthHasEntries = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return entries.some(e => new Date(e.logged_at) >= monthStart);
  }, [entries]);

  const monthForecast = useMemo(function () {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const monthEntries = entries.filter(e => new Date(e.logged_at) >= monthStart);
    const monthTotal = monthEntries.reduce((s, e) => s + Number(e.amount), 0);
    const projected = dayOfMonth > 0 ? (monthTotal / dayOfMonth) * daysInMonth : monthTotal;
    const budget = dailyBudget * daysInMonth;
    return { monthTotal, projected, budget, daysInMonth, dayOfMonth };
  }, [entries, dailyBudget]);

  // Heatmap: per-day totals for the selected calendar month
  const heatmapData = useMemo(() => {
    const now = new Date();
    const baseYear = now.getFullYear();
    const baseMonth = now.getMonth();
    // Apply offset (heatmapMonthOffset = 0 is current, -1 is last month, etc.)
    const targetDate = new Date(baseYear, baseMonth + heatmapMonthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const monthEntries = entries.filter(e => {
      const d = new Date(e.logged_at);
      return d >= monthStart && d <= monthEnd;
    });
    const dayTotals: Record<string, number> = {};
    for (const e of monthEntries) {
      const key = localDateStr(e.logged_at);
      dayTotals[key] = (dayTotals[key] ?? 0) + Number(e.amount);
    }
    const maxDay = Math.max(1, ...Object.values(dayTotals));
    // weekday of the 1st (0=Sun)
    const firstWeekday = new Date(year, month, 1).getDay();
    const isCurrentMonth = heatmapMonthOffset === 0;
    return { year, month, daysInMonth, dayTotals, maxDay, firstWeekday, isCurrentMonth };
  }, [entries, heatmapMonthOffset]);

  // Stagger animation for category bars — reset to 0, then animate when filter changes
  useEffect(() => {
    const count = categoryTotals.length;
    if (isReducedMotion()) {
      // Jump to full width immediately
      barAnims.current = Array.from({ length: count }, () => new Animated.Value(1));
      return;
    }
    // Create fresh Animated.Values (starts at 0)
    barAnims.current = Array.from({ length: count }, () => new Animated.Value(0));
    const animations = barAnims.current.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 400,
        delay: i * 40,
        useNativeDriver: false,
      })
    );
    Animated.parallel(animations).start();
  // Re-run whenever the filtered set changes (view toggle, data refresh, or month navigation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, heatmapMonthOffset]);

  // Animated progress bar for the Month Forecast card
  const forecastBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const target = Math.min(100, Math.round((monthForecast.projected / (monthForecast.budget || 1)) * 100));
    if (isReducedMotion()) {
      forecastBarAnim.setValue(target);
      return;
    }
    Animated.spring(forecastBarAnim, {
      toValue: target,
      useNativeDriver: false,
      tension: 60,
      friction: 10,
    }).start();
  }, [monthForecast.projected]);

  useEffect(() => {
    if (monthForecast.dayOfMonth < 3 || monthForecast.budget <= 0) return;
    const pct = Math.round((monthForecast.projected / monthForecast.budget) * 100);
    const now = new Date();
    const monthKey = `${now.getFullYear()}_${now.getMonth() + 1}`;

    async function checkBudgetAlert() {
      const tier = pct >= 100 ? 100 : pct >= 80 ? 80 : null;
      if (tier === null) return;
      const key = `budget_alert_${monthKey}_${tier}`;
      const already = await AsyncStorage.getItem(key);
      if (already) return;
      await AsyncStorage.setItem(key, "1");
      await notifee.displayNotification({
        title: tier >= 100 ? "You've hit your monthly budget" : "Budget check",
        body: tier >= 100
          ? `You've spent ${formatAmount(monthForecast.monthTotal)} — your full ${formatAmount(monthForecast.budget)} budget for the month.`
          : `You've used ${pct}% of your monthly budget (${formatAmount(monthForecast.projected)} projected of ${formatAmount(monthForecast.budget)}).`,
        android: { channelId: CH_SPENDING, smallIcon: "ic_notification", pressAction: { id: "default" } },
      });
    }
    checkBudgetAlert().catch(() => {});
  }, [monthForecast]);

  function resetAdd() {
    setAddAmount("");
    setAddCategory("Food & Dining");
    setAddMerchant("");
    setAddDate(todayStr());
    setAddNotes("");
    setAddError(null);
  }

  async function submitAdd(parsed: number) {
    setAddSubmitting(true);
    try {
      await api.addSpending({
        amount: parsed,
        category: addCategory,
        merchant_name: addMerchant.trim() || null,
        notes: addNotes.trim() || null,
        logged_at: addDate + "T12:00:00.000Z",
        source: "manual",
      });
      invalidateCache('finance:spending');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowAdd(false);
      resetAdd();
      await load();
      toast("Expense logged.");
    } catch {
      toast("Couldn't save expense.", "error");
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleAdd() {
    setAddError(null);
    const parsed = parseFloat(addAmount.replace(",", "."));
    if (!addAmount.trim() || isNaN(parsed) || parsed <= 0) {
      setAddError("Enter a valid amount.");
      return;
    }
    if (parsed > 10000) {
      Alert.alert("Large amount", `$${parsed.toFixed(2)} — confirm it's not a typo.`, [
        { text: "Fix it", style: "cancel" },
        { text: "Save", onPress: () => void submitAdd(parsed) },
      ]);
      return;
    }
    await submitAdd(parsed);
  }

  function openEdit(entry: SpendingEntry) {
    setEditEntry(entry);
    setEditCategory(normalizeCategory(entry.category));
    setEditNotes(entry.notes ?? "");
  }

  async function handleEdit() {
    if (!editEntry) return;
    setEditSubmitting(true);
    try {
      await api.patchSpending(editEntry.id, { category: editCategory, notes: editNotes.trim() || null });
      invalidateCache('finance:spending');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditEntry(null);
      await load();
      toast("Updated.");
    } catch {
      toast("Couldn't update.", "error");
    } finally {
      setEditSubmitting(false);
    }
  }

  function handleDeleteFromEdit() {
    if (!editEntry) return;
    const label = editEntry.merchant_name ?? editEntry.category ?? "this entry";
    Alert.alert("Delete entry?", `Remove "${label}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          try {
            await api.deleteSpending(editEntry.id);
            invalidateCache('finance:spending');
            setEditEntry(null);
            await load();
            toast("Deleted.");
          } catch {
            toast("Couldn't delete.", "error");
          }
        },
      },
    ]);
  }

  const s = useMemo(() => makeStyles(ink, theme.card, theme.cardBorder, theme.isDark, theme.purple.solid), [ink, theme.card, theme.cardBorder, theme.isDark, theme.purple.solid]);

  return (
    <>
      <LinearGradient colors={[theme.page, theme.gradientEnd]} style={{ flex: 1 }}>
      <ScreenBackground pageId="finance" />
      <ScrollView
        ref={scrollViewRef}
        style={{ backgroundColor: "transparent" }}
        contentContainerStyle={[s.content, tourPadding > 0 && { paddingBottom: tourPadding }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.teal.bar} colors={[theme.teal.bar]} />
        }
        scrollEventThrottle={16}
        onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
      >
        {showTooltip && (
          <TooltipBubble
            message="Track spending by category — connect Plaid to auto-sync transactions, or log manually. Tap any entry to add notes or change the category."
            onDismiss={() => setShowTooltip(false)}
          />
        )}
        {/* Section editor pencil */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 4 }}>
          <Pressable onPress={() => setShowSectionEditor(true)} hitSlop={14} accessibilityLabel="Customize Finance screen">
            <Ionicons name="pencil-outline" size={17} color={theme.textSoft} />
          </Pressable>
        </View>

        {/* Day / Week toggle */}
        <View style={[s.toggle, { backgroundColor: theme.card, borderColor: ink }]}>
          {(["day", "week"] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => { Haptics.selectionAsync(); setView(v); }}
              style={[s.toggleBtn, view === v && { backgroundColor: theme.purple.solid }]}
              accessibilityRole="button"
            >
              <Text style={[s.toggleText, { color: view === v ? "#fff" : theme.textSoft }]}>
                {v === "day" ? "Today" : "This Week"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Skeleton shimmer during initial load */}
        {loading && (
          <View style={{ gap: 12 }}>
            <ShadowCard skeleton skeletonHeight={100} />
            <ShadowCard skeleton skeletonHeight={72} />
            <ShadowCard skeleton skeletonHeight={140} />
          </View>
        )}

        {/* Total card */}
        {!loading && !hiddenSections.includes('totals') && (
        <View ref={tourTotalsRef}>
        <Animated.View style={{ transform: [{ scale: spendingCardScale }] }}>
        <Pressable
          onPressIn={() => Animated.spring(spendingCardScale, { toValue: 0.98, useNativeDriver: true, speed: 300, bounciness: 4 }).start()}
          onPressOut={() => Animated.spring(spendingCardScale, { toValue: 1, useNativeDriver: true, speed: 300, bounciness: 4 }).start()}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAdd(true); }}
          accessibilityRole="button"
          accessibilityLabel="Spending total — tap to add expense"
        >
        <ShadowCard size="hero" bg={theme.purple.tint} accent={theme.purple.solid} rotate={0.6} cardId="spending_total">
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View>
              <Text style={[s.label, { color: theme.purple.sub }]}>
                {view === "day" ? "SPENT TODAY" : "SPENT THIS WEEK"}
              </Text>
              <Text style={[s.totalAmt, { color: theme.purple.fg }]}>{formatAmount(total)}</Text>
              <Text style={[s.sublabel, { color: theme.purple.sub }]}>
                {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
                {syncing ? "  ·  syncing…" : ""}
              </Text>
              {view === "day" && (
                <Text style={{ fontSize: 13, fontWeight: "800", marginTop: 4, color: total <= dailyBudget ? (theme.teal?.solid ?? "#14b8a6") : (theme.red?.solid ?? "#C0392B") }}>
                  {total <= dailyBudget
                    ? "On track"
                    : `Over by $${(total - dailyBudget).toFixed(2)}`}
                </Text>
              )}
              {view === "week" && lastWeekTotal > 0 && (
                <Text style={{ fontSize: 13, fontWeight: "800", marginTop: 4, color: total <= lastWeekTotal ? (theme.teal?.solid ?? "#14b8a6") : (theme.coral?.sub ?? "#f97316") }}>
                  {total <= lastWeekTotal
                    ? `▼ ${formatAmount(lastWeekTotal - total)} less than last week`
                    : `▲ ${formatAmount(total - lastWeekTotal)} more than last week`}
                </Text>
              )}
            </View>
            <View style={[s.addBtn, { backgroundColor: theme.purple.solid, borderColor: ink, alignItems: "center", justifyContent: "center" }]}>
              <Ionicons name="add" size={20} color="#fff" />
            </View>
          </View>
        </ShadowCard>
        </Pressable>
        </Animated.View>
        </View>
        )}

        {/* Category breakdown chart */}
        {categoryTotals.length === 0 && !hiddenSections.includes('breakdown') && (
          <ShadowCard size="card" cardId="spending_breakdown_empty">
            <Text style={[s.cardTitle, { color: theme.textStrong }]}>Where it went</Text>
            <Text style={{ color: theme.textSoft, fontSize: 13, marginTop: 6 }}>
              Category breakdown will appear once you've logged transactions.
            </Text>
          </ShadowCard>
        )}
        {categoryTotals.length > 0 && !hiddenSections.includes('breakdown') && (
          <View ref={tourBreakdownRef}>
          <ShadowCard size="card" cardId="spending_breakdown">
            <Text style={[s.cardTitle, { color: theme.textStrong }]}>Where it went</Text>
            <View style={{ gap: 11, marginTop: 6 }}>
              {categoryTotals.map(([cat, amt], idx) => {
                const color = getCategoryColor(cat);
                const targetPct = Math.round((amt / maxCat) * 100);
                const animVal = barAnims.current[idx] ?? new Animated.Value(1);
                const animatedWidth = animVal.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", `${targetPct}%`],
                });
                return (
                  <View key={cat}>
                    <View style={s.chartRow}>
                      <Text style={[s.chartCat, { color: theme.textStrong }]}>{cat}</Text>
                      <Text style={[s.chartAmt, { color }]}>{formatAmount(amt)}</Text>
                    </View>
                    <View style={[s.barTrack, { backgroundColor: color + "22" }]}>
                      <Animated.View style={[s.barFill, { backgroundColor: color, width: animatedWidth }]} />
                    </View>
                  </View>
                );
              })}
            </View>
          </ShadowCard>
          </View>
        )}

        {/* Month forecast card */}
        {entries.length > 0 && monthForecast.dayOfMonth >= 3 && (function () {
          const overBudget = monthForecast.projected > monthForecast.budget;
          const pct = Math.min(100, Math.round((monthForecast.projected / monthForecast.budget) * 100));
          const barColor = pct > 110 ? theme.red?.solid ?? "#C0392B" : pct > 90 ? theme.amber?.solid ?? "#f59e0b" : theme.teal.solid;
          const remaining = monthForecast.budget - monthForecast.projected;
          return (
            <ShadowCard size="card" accent={theme.purple.solid} rotate={-0.3}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Ionicons name="trending-up-outline" size={18} color={theme.purple.solid} />
                <Text style={[s.cardTitle, { color: theme.textStrong, marginBottom: 0 }]}>Month forecast</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                <View>
                  <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>PROJECTED</Text>
                  <CountUpText
                    value={monthForecast.projected}
                    format={(v) => formatAmount(v)}
                    duration={400}
                    style={{ color: overBudget ? (theme.red?.solid ?? "#C0392B") : theme.textStrong, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 }}
                  />
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: theme.textSoft, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>BUDGET</Text>
                  <CountUpText
                    value={monthForecast.budget}
                    format={(v) => formatAmount(v)}
                    duration={400}
                    style={{ color: theme.textSoft, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 }}
                  />
                </View>
              </View>
              <View style={{ height: 8, backgroundColor: theme.cardBorder, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                <Animated.View style={{
                  height: 8,
                  width: forecastBarAnim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
                  backgroundColor: barColor,
                  borderRadius: 4,
                }} />
              </View>
              <Text style={{ color: overBudget ? (theme.red?.solid ?? "#C0392B") : theme.teal.solid, fontSize: 13, fontWeight: "800" }}>
                {overBudget
                  ? formatAmount(Math.abs(remaining)) + " over budget at this pace"
                  : formatAmount(remaining) + " under budget at this pace"}
              </Text>
              <Text style={{ color: theme.textSoft, fontSize: 10, marginTop: 4 }}>
                Based on {monthForecast.dayOfMonth} days of spending · day {monthForecast.dayOfMonth} of {monthForecast.daysInMonth}
              </Text>
            </ShadowCard>
          );
        })()}

        {/* Spending heatmap — navigable month calendar grid */}
        {entries.length > 0 && (function () {
          const { year, month, daysInMonth, dayTotals, maxDay, firstWeekday, isCurrentMonth } = heatmapData;
          const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
          // Build flat array: leading empty slots + day numbers
          const cells: (number | null)[] = [
            ...Array(firstWeekday).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];
          // Pad to multiple of 7
          while (cells.length % 7 !== 0) cells.push(null);
          const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
          const PURPLE = theme.purple.solid;
          const PURPLE_TINT = theme.purple.tint;
          const PURPLE_SUB = theme.purple.sub ?? theme.purple.solid;
          const selectedDayTotal = heatmapSelectedDay ? (dayTotals[heatmapSelectedDay] ?? 0) : null;
          // Legend steps: 5 cells from tint to solid
          const LEGEND_STEPS = 5;
          return (
            <ShadowCard size="card" cardId="spending_heatmap">
              {/* Header row with month navigation */}
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
                <Ionicons name="calendar-outline" size={17} color={PURPLE} style={{ marginRight: 8 }} />
                <Text style={[s.cardTitle, { color: theme.textStrong, marginBottom: 0, flex: 1 }]}>{monthLabel}</Text>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setHeatmapSelectedDay(null);
                    setHeatmapMonthOffset(prev => prev - 1);
                  }}
                  hitSlop={14}
                  accessibilityLabel="Previous month"
                  accessibilityRole="button"
                  style={{ padding: 4 }}
                >
                  <Ionicons name="chevron-back" size={18} color={theme.textSoft} />
                </Pressable>
                <Pressable
                  onPress={() => {
                    Haptics.selectionAsync();
                    setHeatmapSelectedDay(null);
                    setHeatmapMonthOffset(prev => Math.min(0, prev + 1));
                  }}
                  hitSlop={14}
                  accessibilityLabel="Next month"
                  accessibilityRole="button"
                  style={{ padding: 4, opacity: isCurrentMonth ? 0.3 : 1 }}
                  disabled={isCurrentMonth}
                >
                  <Ionicons name="chevron-forward" size={18} color={theme.textSoft} />
                </Pressable>
              </View>
              {/* Day-of-week header */}
              <View style={{ flexDirection: "row", marginBottom: 4 }}>
                {DAY_LABELS.map(d => (
                  <View key={d} style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: theme.textSoft }}>{d}</Text>
                  </View>
                ))}
              </View>
              {/* Calendar grid */}
              {Array.from({ length: cells.length / 7 }, (_, rowIdx) => (
                <View key={rowIdx} style={{ flexDirection: "row", marginBottom: 4 }}>
                  {cells.slice(rowIdx * 7, rowIdx * 7 + 7).map((day, colIdx) => {
                    if (!day) return <View key={colIdx} style={{ flex: 1, margin: 2 }} />;
                    const pad = (n: number) => String(n).padStart(2, "0");
                    const dateKey = `${year}-${pad(month + 1)}-${pad(day)}`;
                    const spend = dayTotals[dateKey] ?? 0;
                    const alpha = spend > 0
                      ? Math.round(20 + (spend / maxDay) * 215)
                      : 0x14; // min visible tint for zero-spend days
                    const alphaHex = alpha.toString(16).padStart(2, "0");
                    const isSelected = heatmapSelectedDay === dateKey;
                    return (
                      <Pressable
                        key={colIdx}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setHeatmapSelectedDay(prev => prev === dateKey ? null : dateKey);
                        }}
                        style={{
                          flex: 1, margin: 2, aspectRatio: 1,
                          borderRadius: 6,
                          backgroundColor: PURPLE + alphaHex,
                          borderWidth: isSelected ? 1.5 : 0,
                          borderColor: isSelected ? PURPLE : "transparent",
                          alignItems: "center", justifyContent: "center",
                        }}
                        accessibilityLabel={`${dateKey} ${spend > 0 ? formatAmount(spend) : "no spend"}`}
                        accessibilityRole="button"
                      >
                        <Text style={{ fontSize: 10, fontWeight: isSelected ? "900" : "600", color: spend > 0 ? PURPLE_SUB : theme.textSoft }}>
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              {/* Selected day total label */}
              {heatmapSelectedDay && (
                <View style={{ marginTop: 6, alignItems: "center" }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: PURPLE_SUB }}>
                    {new Date(heatmapSelectedDay + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    {" — "}
                    {selectedDayTotal! > 0 ? formatAmount(selectedDayTotal!) : "no transactions"}
                  </Text>
                </View>
              )}
              {/* Legend: less → more */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 10, gap: 4 }}>
                <Text style={{ fontSize: 9, fontWeight: "600", color: theme.textSoft }}>Less</Text>
                {Array.from({ length: LEGEND_STEPS }, (_, i) => {
                  const stepAlpha = Math.round(0x14 + (i / (LEGEND_STEPS - 1)) * (0xFF - 0x14));
                  const stepHex = stepAlpha.toString(16).padStart(2, "0");
                  return (
                    <View
                      key={i}
                      style={{
                        width: 14, height: 14, borderRadius: 3,
                        backgroundColor: i === 0 ? PURPLE_TINT : PURPLE + stepHex,
                      }}
                    />
                  );
                })}
                <Text style={{ fontSize: 9, fontWeight: "600", color: theme.textSoft }}>More</Text>
              </View>
            </ShadowCard>
          );
        })()}

        {/* Spending-Mood suggestion banner */}
        {moodSuggestion && !hiddenSections.includes('mood_suggest') && (
          <ShadowCard bg={theme.berry?.tint ?? theme.card} borderColor={theme.berry?.solid ?? theme.cardBorder}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={theme.berry?.solid ?? theme.textStrong} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textStrong, fontSize: 14, fontWeight: "900", marginBottom: 4 }}>Heads up</Text>
                <Text style={{ color: theme.textStrong, fontSize: 13, lineHeight: 18 }}>
                  {`This purchase ($${Number(moodSuggestion.amount).toFixed(2)}${moodSuggestion.merchant_name ? " from " + moodSuggestion.merchant_name : ""}) happened close to a ${moodSuggestion.mood_label} check-in. Want to tag it as related?`}
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                  <Pressable
                    onPress={async () => {
                      try {
                        await api.tagSpending(moodSuggestion.spending_id, 'emotional_spend');
                        setMoodSuggestion(null);
                        toast("Tagged");
                      } catch {
                        toast("Couldn't tag.", "error");
                      }
                    }}
                    style={[s.suggBtn, { backgroundColor: theme.teal.solid, borderColor: theme.teal.solid }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>Yes, tag it</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setMoodSuggestion(null)}
                    style={[s.suggBtn, { backgroundColor: "transparent", borderColor: theme.cardBorder }]}
                  >
                    <Text style={{ color: theme.textSoft, fontSize: 13, fontWeight: "700" }}>No thanks</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ShadowCard>
        )}

        {/* Transaction list grouped by day */}
        {!loading && !monthHasEntries ? (
          <FinanceEmptyState onAdd={() => setShowAdd(true)} />
        ) : (
          grouped.map(([day, dayEntries]) => (
            <View key={day}>
              <Text style={[s.dayHeader, { color: theme.textSoft }]}>{formatDayHeader(day)}</Text>
              <ShadowCard padding={16}>
                {dayEntries.map((e, i) => {
                  const cat = normalizeCategory(e.category);
                  const color = getCategoryColor(cat);
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => openEdit(e)}
                      style={[
                        s.txRow,
                        i < dayEntries.length - 1 && { borderBottomWidth: 1, borderBottomColor: ink + "18" },
                      ]}
                      accessibilityRole="button"
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                        <IconBadge name="card-outline" color={color} bgColor={color + "20"} size={16} containerSize={32} borderRadius={8} />
                        <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[s.merchant, { color: theme.textStrong }]} numberOfLines={1}>
                          {e.merchant_name ?? cat}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <View style={[s.catBadge, { backgroundColor: color + "20" }]}>
                            <Text style={[s.catBadgeText, { color }]}>{cat}</Text>
                          </View>
                          {e.source === "plaid" && (
                            <Ionicons name="card-outline" size={11} color={theme.textSoft} />
                          )}
                          {e.tag === "emotional_spend" && (
                            <View style={{ borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: theme.berry.tint ?? theme.purple.tint }}>
                              <Text style={{ fontSize: 10, fontWeight: "700", color: theme.berry?.solid ?? theme.purple.solid }}>emotional</Text>
                            </View>
                          )}
                          <Text style={[s.txTime, { color: theme.textSoft }]}>{formatTime(e.logged_at)}</Text>
                        </View>
                        {e.notes ? (
                          <Text style={[s.txNotes, { color: theme.textSoft }]} numberOfLines={1}>{e.notes}</Text>
                        ) : null}
                        </View>
                      </View>
                      <Text style={[s.txAmt, { color: theme.purple.sub }]}>{formatAmount(Number(e.amount))}</Text>
                    </Pressable>
                  );
                })}
              </ShadowCard>
            </View>
          ))
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
      </LinearGradient>

      {/* Add modal */}
      <Modal
        visible={showAdd}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowAdd(false); resetAdd(); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: theme.page }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: theme.textStrong }]}>Log expense</Text>
                <Pressable onPress={() => { setShowAdd(false); resetAdd(); }} accessibilityRole="button" accessibilityLabel="Close add entry">
                  <Ionicons name="close" size={24} color={theme.textSoft} />
                </Pressable>
              </View>

              <Text style={[s.fieldLabel, { color: theme.textSoft }]}>Amount</Text>
              <TextInput
                value={addAmount}
                onChangeText={(v) => { setAddAmount(v); setAddError(null); }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={theme.textSoft}
                autoFocus
                style={[s.amountInput, { color: theme.textStrong, borderColor: addError ? theme.danger : ink }]}
                returnKeyType="done"
              />
              {addError ? <Text style={[s.errorText, { color: theme.danger }]}>{addError}</Text> : null}

              <Text style={[s.fieldLabel, { color: theme.textSoft }]}>Category</Text>
              <View style={s.chipWrap}>
                {CATEGORIES.map((cat) => {
                  const active = addCategory === cat;
                  const color = getCategoryColor(cat);
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => { Haptics.selectionAsync(); setAddCategory(cat); }}
                      style={[s.chip, {
                        borderColor: active ? color : ink + "55",
                        backgroundColor: active ? color + "22" : "transparent",
                      }]}
                    >
                      <Text style={[s.chipText, { color: active ? color : theme.textSoft, fontWeight: active ? "700" : "500" }]}>
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[s.fieldLabel, { color: theme.textSoft }]}>Store / merchant (optional)</Text>
              <TextInput
                value={addMerchant}
                onChangeText={setAddMerchant}
                placeholder="e.g. Chipotle, Amazon"
                placeholderTextColor={theme.textSoft}
                style={[s.textInput, { color: theme.textStrong, borderColor: ink }]}
                returnKeyType="next"
              />

              <Text style={[s.fieldLabel, { color: theme.textSoft }]}>Date</Text>
              <TextInput
                value={addDate}
                onChangeText={setAddDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSoft}
                style={[s.textInput, { color: theme.textStrong, borderColor: ink }]}
                returnKeyType="next"
              />

              <Text style={[s.fieldLabel, { color: theme.textSoft }]}>Notes (optional)</Text>
              <TextInput
                value={addNotes}
                onChangeText={setAddNotes}
                placeholder="Any extra detail…"
                placeholderTextColor={theme.textSoft}
                multiline
                numberOfLines={2}
                style={[s.textInput, { color: theme.textStrong, borderColor: ink, minHeight: 60, textAlignVertical: "top" }]}
              />

              <Pressable
                onPress={handleAdd}
                disabled={addSubmitting}
                style={[s.saveBtn, { backgroundColor: theme.purple.solid, borderColor: ink, opacity: addSubmitting ? 0.6 : 1 }]}
              >
                {addSubmitting
                  ? <LoadingIndicator size="small" color="#fff" />
                  : <Text style={s.saveBtnText}>Save expense</Text>}
              </Pressable>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      <SectionEditorModal
        visible={showSectionEditor}
        title="Customize Finance"
        sections={FINANCE_SECTIONS}
        hidden={hiddenSections}
        onSave={handleSaveSections}
        onCancel={() => setShowSectionEditor(false)}
      />

      {/* Edit modal */}
      <Modal
        visible={!!editEntry}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditEntry(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, backgroundColor: theme.page }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: theme.textStrong }]} numberOfLines={1}>
                    {editEntry?.merchant_name ?? "Edit entry"}
                  </Text>
                  {editEntry && (
                    <Text style={[s.editMeta, { color: theme.textSoft }]}>
                      {formatAmount(Number(editEntry.amount))}  ·  {formatTime(editEntry.logged_at)}
                      {editEntry.source === "plaid" ? "  ·  imported" : ""}
                    </Text>
                  )}
                </View>
                <Pressable onPress={() => setEditEntry(null)} style={{ marginLeft: 12 }} accessibilityRole="button" accessibilityLabel="Close edit entry">
                  <Ionicons name="close" size={24} color={theme.textSoft} />
                </Pressable>
              </View>

              <Text style={[s.fieldLabel, { color: theme.textSoft }]}>Category</Text>
              <View style={s.chipWrap}>
                {CATEGORIES.map((cat) => {
                  const active = editCategory === cat;
                  const color = getCategoryColor(cat);
                  return (
                    <Pressable
                      key={cat}
                      onPress={() => { Haptics.selectionAsync(); setEditCategory(cat); }}
                      style={[s.chip, {
                        borderColor: active ? color : ink + "55",
                        backgroundColor: active ? color + "22" : "transparent",
                      }]}
                    >
                      <Text style={[s.chipText, { color: active ? color : theme.textSoft, fontWeight: active ? "700" : "500" }]}>
                        {cat}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[s.fieldLabel, { color: theme.textSoft }]}>Notes</Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add a note…"
                placeholderTextColor={theme.textSoft}
                multiline
                numberOfLines={3}
                style={[s.textInput, { color: theme.textStrong, borderColor: ink, minHeight: 70, textAlignVertical: "top" }]}
              />

              <Pressable
                onPress={handleEdit}
                disabled={editSubmitting}
                style={[s.saveBtn, { backgroundColor: theme.purple.solid, borderColor: ink, opacity: editSubmitting ? 0.6 : 1 }]}
              >
                {editSubmitting
                  ? <LoadingIndicator size="small" color="#fff" />
                  : <Text style={s.saveBtnText}>Save changes</Text>}
              </Pressable>

              <Pressable onPress={handleDeleteFromEdit} style={[s.deleteBtn, { borderColor: ink }]}>
                <Text style={[s.deleteBtnText, { color: theme.danger }]}>Delete entry</Text>
              </Pressable>
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
      <FeatureTour steps={FINANCE_TOUR} visible={showTour} onDone={() => setShowTour(false)} scrollRef={scrollViewRef} scrollY={scrollOffsetRef.current} onExtraPadding={setTourPadding} />
      <FeatureIntroSheet intro={financeIntro} visible={introVisible} onClose={dismissIntro} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function makeStyles(ink: string, card: string, border: string, isDark: boolean = false, purple: string = "#7B3FBF") {
  const shadowCard = coloredShadow(purple);
  return StyleSheet.create({
    content:     { padding: 16, gap: 12, paddingBottom: 40 },
    toggle:      { flexDirection: "row", borderRadius: 22, borderWidth: 2, overflow: "hidden", ...shadowCard },
    toggleBtn:   { flex: 1, paddingVertical: 10, alignItems: "center" },
    toggleText:  { fontSize: 13, fontWeight: "700" },
    card:        { borderRadius: 26, borderWidth: 2, padding: 16, backgroundColor: card, ...shadowCard, gap: 4 },
    cardTitle:   { fontSize: 17, fontWeight: "900", letterSpacing: -0.5, marginBottom: 2 },
    label:       { fontSize: 9, fontWeight: "900", letterSpacing: 0.6, marginBottom: 2, textTransform: "uppercase" },
    totalAmt:    { fontSize: 44, fontWeight: "900", lineHeight: 52, letterSpacing: -1 },
    sublabel:    { fontSize: 12, marginTop: 2 },
    addBtn: {
      width: 38, height: 38, borderRadius: 19, borderWidth: 2,
      alignItems: "center", justifyContent: "center",
      ...layeredShadow('tile', isDark),
    },
    chartRow:    { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    chartCat:    { fontSize: 13, fontWeight: "600" },
    chartAmt:    { fontSize: 13, fontWeight: "700" },
    barTrack:    { height: 7, borderRadius: 4, overflow: "hidden" },
    barFill:     { height: "100%", borderRadius: 4 },
    dayHeader:   { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginBottom: -4, marginLeft: 4 },
    txRow:       { flexDirection: "row", alignItems: "center", paddingVertical: 12, gap: 12 },
    merchant:    { fontSize: 14, fontWeight: "700" },
    catBadge:    { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
    catBadgeText:{ fontSize: 10, fontWeight: "700" },
    txTime:      { fontSize: 11 },
    txNotes:     { fontSize: 11, fontStyle: "italic" },
    txAmt:       { fontSize: 15, fontWeight: "800", minWidth: 64, textAlign: "right" },
    modalContent:{ padding: 20, gap: 10, paddingBottom: 40 },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
    modalTitle:  { fontSize: 20, fontWeight: "800" },
    editMeta:    { fontSize: 12, marginTop: 2 },
    fieldLabel:  { fontSize: 12, fontWeight: "600", marginBottom: -2 },
    amountInput: {
      borderWidth: 2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 32, fontWeight: "800",
      ...layeredShadow('card', isDark),
    },
    errorText:   { fontSize: 12, marginTop: -4 },
    textInput: {
      borderWidth: 2, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 15, fontWeight: "500",
      ...layeredShadow('card', isDark),
    },
    chipWrap:    { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    chip:        { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
    chipText:    { fontSize: 12 },
    saveBtn: {
      borderRadius: 22, borderWidth: 2, paddingVertical: 14, alignItems: "center", marginTop: 6,
      ...layeredShadow('card', isDark),
    },
    saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
    deleteBtn:   { borderRadius: 22, borderWidth: 2, paddingVertical: 12, alignItems: "center", backgroundColor: "transparent" },
    deleteBtnText:{ fontWeight: "700", fontSize: 15 },
    suggBtn:     { borderRadius: 16, borderWidth: 2, paddingHorizontal: 16, paddingVertical: 9, alignItems: "center", justifyContent: "center" },
  });
}
