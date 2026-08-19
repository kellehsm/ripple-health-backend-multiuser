import notifee, { AndroidImportance, TriggerType, RepeatFrequency } from "./notifeeSafe";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";
import { isMuted } from "./muteNotifications";

// ─── Channels ─────────────────────────────────────────────────────────────────

export const CH_MEALS        = "ripple-meal-reminders";
export const CH_GLUCOSE      = "ripple-glucose";
export const CH_EVENING      = "ripple-evening";
export const CH_WATER        = "ripple-water";
export const CH_WEEKLY       = "ripple-weekly";
export const CH_STREAK       = "ripple-streak";
export const CH_MOOD         = "ripple-mood";
export const CH_BOOKS        = "ripple-books";
export const CH_HOBBIES      = "ripple-hobbies";
export const CH_SPENDING     = "ripple-spending";
export const CH_MEDS         = "ripple-medication";
export const CH_CYCLE        = "ripple-cycle";
export const CH_EXERCISE     = "ripple-exercise";
export const CH_MINDFULNESS  = "ripple-mindfulness";
export const CH_SLEEP        = "ripple-sleep";

export async function initSmartChannels() {
  await Promise.all([
    notifee.createChannel({ id: CH_MEALS,       name: "Meal Reminders",         importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_GLUCOSE,     name: "Glucose Alerts",         importance: AndroidImportance.HIGH }),
    notifee.createChannel({ id: CH_EVENING,     name: "Evening Check-in",       importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_WATER,       name: "Water Reminders",        importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_STREAK,      name: "Streak Protection",      importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_MOOD,        name: "Mood Check-in",          importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_BOOKS,       name: "Reading Reminders",      importance: AndroidImportance.MIN }),
    notifee.createChannel({ id: CH_HOBBIES,     name: "Hobby Reminders",        importance: AndroidImportance.MIN }),
    notifee.createChannel({ id: CH_SPENDING,    name: "Spending Alerts",        importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_MEDS,        name: "Medication Reminders",   importance: AndroidImportance.HIGH }),
    notifee.createChannel({ id: CH_CYCLE,       name: "Cycle Reminders",        importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_EXERCISE,    name: "Workout Alerts",         importance: AndroidImportance.HIGH }),
    notifee.createChannel({ id: CH_MINDFULNESS, name: "Mindfulness Reminders",  importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_SLEEP,       name: "Sleep Reminders",        importance: AndroidImportance.DEFAULT }),
    notifee.createChannel({ id: CH_WEEKLY,      name: "Weekly Digest",          importance: AndroidImportance.DEFAULT }),
  ]);
}

// ─── Deduplication ────────────────────────────────────────────────────────────
// Resets at midnight so each reminder fires once per calendar day at most.

const sent = new Set<string>();
let sentDate = "";

function resetIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== sentDate) { sentDate = today; sent.clear(); }
}

function wasSent(key: string): boolean {
  resetIfNewDay();
  return sent.has(key);
}

function markSent(key: string) { sent.add(key); }

// ─── Sleep hours guard ────────────────────────────────────────────────────────
// Suppress non-urgent notifications between 11pm and 6am.

function isNighttime(now: Date): boolean {
  const h = now.getHours();
  return h >= 23 || h < 6;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const MOOD_SCORE_LABELS: Record<number, string> = { 5: "great", 4: "good", 3: "okay", 2: "low", 1: "rough" };

function moodDescription(entry: any): string | null {
  if (entry?.mood_label) return entry.mood_label.toLowerCase();
  const s = Number(entry?.mood_score);
  return MOOD_SCORE_LABELS[s] ?? null;
}

// ─── Mute guard ───────────────────────────────────────────────────────────────
// All check* functions call this early-exit helper. If the user has activated a
// mute window, every notification type is suppressed until it expires.

async function areMuted(): Promise<boolean> {
  return isMuted();
}

// ─── Meal reminders ───────────────────────────────────────────────────────────

type MealCfg = { key: string; label: string; defaultHour: number; windowStart: number; windowEnd: number };
const MEALS: MealCfg[] = [
  { key: "breakfast", label: "Breakfast", defaultHour: 9,  windowStart: 4,  windowEnd: 11 },
  { key: "lunch",     label: "Lunch",     defaultHour: 13, windowStart: 11, windowEnd: 15 },
  { key: "dinner",    label: "Dinner",    defaultHour: 19, windowStart: 17, windowEnd: 23 },
];

export async function checkMealReminders(settings: any, now: Date) {
  if (await areMuted()) return;
  const mealCfg = settings?.smart_notifications?.meal_reminders;
  if (!mealCfg?.enabled) return;
  if (isNighttime(now)) return;

  const nowH = now.getHours();
  const today = now.toISOString().slice(0, 10);

  let meals: any[] = [];
  let streak = 0;
  try {
    [meals] = await Promise.all([api.meals(today)]);
    const streakData = await api.streaks().catch(() => null);
    streak = streakData?.meal_streak ?? 0;
  } catch (_) {}

  for (const m of MEALS) {
    const periodCfg = mealCfg[m.key] ?? {};
    if (periodCfg.enabled === false) continue;

    const reminderH: number = periodCfg.hour ?? m.defaultHour;
    if (nowH < reminderH) continue;
    if (wasSent(`meal_${m.key}`)) continue;
    markSent(`meal_${m.key}`);

    const alreadyLogged = Array.isArray(meals) && meals.some((entry: any) => {
      const h = new Date(entry.logged_at).getHours();
      return h >= m.windowStart && h < m.windowEnd;
    });
    if (alreadyLogged) continue;

    const mealCount = Array.isArray(meals) ? meals.length : 0;
    let body = `No ${m.label.toLowerCase()} logged yet — want to add it?`;
    if (m.key === "breakfast" && streak >= 3) {
      body = `You have a ${plural(streak, "day")} streak — keep it going with ${m.label.toLowerCase()}.`;
    } else if (m.key === "lunch" && mealCount > 0) {
      body = `You logged breakfast. Lunch time?`;
    } else if (m.key === "lunch" && mealCount === 0) {
      body = `Nothing logged yet today — still time for lunch.`;
    } else if (m.key === "dinner" && mealCount >= 2) {
      body = `You've logged ${plural(mealCount, "meal")} today. How did dinner go?`;
    } else if (m.key === "dinner" && mealCount === 1) {
      body = `You logged 1 meal today. How did dinner go?`;
    } else if (m.key === "dinner" && mealCount === 0) {
      body = `No meals logged yet today — you can still add dinner.`;
    }

    await notifee.displayNotification({
      id: `meal-reminder-${m.key}`,
      title: `${m.label} logged?`,
      body,
      data: { target: "meals", action: "add" },
      android: {
        channelId: CH_MEALS,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Log Meal",      pressAction: { id: "log-meal",           launchActivity: "default" } },
          { title: "Already logged",pressAction: { id: `ack-meal-${m.key}` } },
          { title: "Later",         pressAction: { id: `skip-meal-${m.key}` } },
        ],
      },
    });
  }
}

// ─── Glucose spike alert ──────────────────────────────────────────────────────

let lastSpikeMs = 0;
const SPIKE_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export async function checkGlucoseSpike(settings: any, now: Date) {
  if (await areMuted()) return;
  const spikeCfg = settings?.smart_notifications?.glucose_spike;
  if (!spikeCfg?.enabled) return;
  if (now.getTime() - lastSpikeMs < SPIKE_COOLDOWN_MS) return;

  const threshold: number = spikeCfg.threshold_mg_dl ?? 30;
  try {
    const windowStart = new Date(now.getTime() - 70 * 60 * 1000);
    const readings = await api.glucoseRange(windowStart.toISOString(), now.toISOString());
    if (!Array.isArray(readings) || readings.length < 2) return;

    const earliest = Number(readings[0].mg_dl);
    const latest = Number(readings[readings.length - 1].mg_dl);
    const rise = latest - earliest;
    if (rise < threshold) return;

    // Suppress if a meal was already logged within the past hour — the app already has the context
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);
    const recentMeals = await api.meals(todayStr).catch(() => [] as any[]);
    const hasRecentMeal = Array.isArray(recentMeals) && recentMeals.some(
      (m: any) => new Date(m.logged_at) >= oneHourAgo,
    );
    if (hasRecentMeal) return;

    lastSpikeMs = now.getTime();
    const current = latest;
    const rangeNote = current > 180 ? " — currently above your target range" : "";

    await notifee.displayNotification({
      id: "glucose-spike",
      title: "Glucose rising \u{1F4C8}",
      body: `Up ${rise} mg/dL in the last hour (${earliest} → ${latest} mg/dL${rangeNote}). Worth logging if you ate or drank something recently.`,
      data: { target: "meals", action: "add" },
      android: {
        channelId: CH_GLUCOSE,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Log Meal / Drink", pressAction: { id: "log-meal", launchActivity: "default" } },
          { title: "Dismiss",          pressAction: { id: "dismiss-spike" } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Water reminder ───────────────────────────────────────────────────────────

let cachedWaterMetricId: string | null = null;
let lastWaterReminderMs = 0;
const WATER_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const waterGoalCelebrationSent = new Set<string>();

export async function checkWaterReminder(settings: any, now: Date) {
  if (await areMuted()) return;
  const waterCfg = settings?.smart_notifications?.water_reminder;
  if (!waterCfg?.enabled) return;

  const startH: number = waterCfg.start_hour ?? 9;
  if (now.getHours() < startH) return;
  if (isNighttime(now)) return;
  if (now.getTime() - lastWaterReminderMs < WATER_COOLDOWN_MS) return;

  const goal: number = waterCfg.goal ?? 8;
  const todayKey = now.toISOString().slice(0, 10);

  try {
    if (!cachedWaterMetricId) {
      const metric = await api.getOrCreateWaterMetric();
      cachedWaterMetricId = metric?.id ?? null;
    }
    if (!cachedWaterMetricId) return;

    const logs: any[] = await api.todaysWaterCount(cachedWaterMetricId);
    const todayStr = now.toDateString();
    const todayCount = Array.isArray(logs)
      ? Math.round(logs.filter((l) => new Date(l.logged_at).toDateString() === todayStr).reduce((s, l) => s + Number(l.value), 0))
      : 0;

    // Suppress if water was already logged within the past hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const hasRecentWater = Array.isArray(logs) && logs.some(
      (l: any) => new Date(l.logged_at) >= oneHourAgo,
    );
    if (hasRecentWater) return;

    if (todayCount >= goal) {
      // One-time goal completion celebration
      const celebKey = `water_goal_${todayKey}`;
      if (!waterGoalCelebrationSent.has(celebKey)) {
        waterGoalCelebrationSent.add(celebKey);
        await notifee.displayNotification({
          id: "water-goal-complete",
          title: "Water goal reached! 💧",
          body: `Nice work — you've hit your ${goal}-glass goal for today.`,
          android: {
            channelId: CH_WATER,
            smallIcon: "ic_launcher",
            pressAction: { id: "default" },
          },
        });
      }
      return;
    }

    // Adaptive pace: only nudge when behind the prorated pace toward the
    // daily goal (linear from start hour to 9pm). On-pace users get silence
    // instead of fixed-interval pestering.
    const endMins = 21 * 60;
    const startMins = startH * 60;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const dayFrac = Math.min(Math.max((nowMins - startMins) / (endMins - startMins), 0), 1);
    const expected = goal * dayFrac;
    if (todayCount >= Math.floor(expected)) return;

    lastWaterReminderMs = now.getTime();

    let body: string;
    const remaining = goal - todayCount;
    const lateInDay = now.getHours() >= 15;
    if (todayCount === 0) {
      body = lateInDay
        ? `No water logged yet today — even a few glasses before evening helps.`
        : `No water logged yet today — a good time to start.`;
    } else if (todayCount < goal / 2) {
      body = `You've logged ${plural(todayCount, "glass")} of ${goal}. ${remaining} more to reach your goal.`;
    } else {
      body = `You're at ${todayCount}/${goal} glasses — ${remaining} more and you're there.`;
    }

    await notifee.displayNotification({
      id: "water-reminder",
      title: "Time for some water 💧",
      body,
      android: {
        channelId: CH_WATER,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Drink 1 Glass", pressAction: { id: "log-water" } },
          { title: "Dismiss",       pressAction: { id: "dismiss-water" } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Mood check-in ────────────────────────────────────────────────────────────
// Fires around 2pm and 7pm if no mood logged in that window.

export async function checkMoodReminder(settings: any, now: Date) {
  if (await areMuted()) return;
  const moodCfg = settings?.smart_notifications?.mood_checkin;
  if (!moodCfg?.enabled) return;
  if (isNighttime(now)) return;

  const h = now.getHours();

  const windowKey = h >= 14 && h < 19 ? "afternoon" : h >= 19 && h < 23 ? "evening" : null;
  if (!windowKey) return;

  const sentKey = `mood_${windowKey}`;
  if (wasSent(sentKey)) return;
  markSent(sentKey);

  try {
    const entries = await api.journalToday().catch(() => [] as any[]);
    const hasRecentMood = Array.isArray(entries) && entries.some((e: any) => {
      const eh = new Date(e.logged_at).getHours();
      return windowKey === "afternoon" ? (eh >= 11 && eh < 18) : (eh >= 17);
    });
    if (hasRecentMood) return;

    const morningEntry = Array.isArray(entries)
      ? entries.find((e: any) => { const eh = new Date(e.logged_at).getHours(); return eh >= 4 && eh < 12; })
      : null;
    const afternoonEntry = Array.isArray(entries)
      ? entries.find((e: any) => { const eh = new Date(e.logged_at).getHours(); return eh >= 12 && eh < 17; })
      : null;

    let title: string;
    let body: string;
    if (windowKey === "afternoon") {
      title = "Afternoon check-in";
      const desc = moodDescription(morningEntry);
      body = desc
        ? `How's your afternoon? You logged '${desc}' this morning.`
        : "How are you feeling right now? A quick mood note takes a moment.";
    } else {
      title = "Evening check-in";
      const desc = moodDescription(afternoonEntry) ?? moodDescription(morningEntry);
      const when = afternoonEntry ? "this afternoon" : morningEntry ? "this morning" : null;
      body = desc && when
        ? `How did the rest of your day go? You were '${desc}' ${when}.`
        : "How did your day go? A quick check-in helps you notice patterns.";
    }

    await notifee.displayNotification({
      id: `mood-checkin-${windowKey}`,
      title,
      body,
      data: { target: "home" },
      android: {
        channelId: CH_MOOD,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Check In", pressAction: { id: "log-mood", launchActivity: "default" } },
          { title: "Skip",     pressAction: { id: `skip-mood-${windowKey}` } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Evening summary ──────────────────────────────────────────────────────────

export async function checkEveningCheckin(settings: any, now: Date) {
  if (await areMuted()) return;
  const checkinCfg = settings?.smart_notifications?.evening_checkin;
  if (!checkinCfg?.enabled) return;

  const targetH: number = checkinCfg.hour ?? 21;
  if (now.getHours() < targetH) return;
  if (wasSent("evening_checkin")) return;
  markSent("evening_checkin");

  const today = now.toISOString().slice(0, 10);
  let body = "Nothing logged today — add a quick note before bed?";
  try {
    const [meals, streakData, dse] = await Promise.all([
      api.meals(today).catch(() => [] as any[]),
      api.streaks().catch(() => null),
      api.dailySummary(today).catch(() => null),
    ]);

    const parts: string[] = [];
    const mealCount = Array.isArray(meals) ? meals.length : 0;
    const streak = streakData?.meal_streak ?? 0;

    if (mealCount > 0) parts.push(`${plural(mealCount, "meal")} logged`);
    if (streak > 0) parts.push(`${streak}-day streak`);

    const overall = dse?.scores?.overall;
    if (overall !== null && overall !== undefined) {
      const label = overall >= 75 ? "great day" : overall >= 55 ? "solid day" : "active day";
      parts.push(`overall ${overall} — ${label}`);
    }

    if (parts.length > 0) body = parts.join(" · ");
  } catch (_) {}

  await notifee.displayNotification({
    id: "evening-checkin",
    title: "End of day",
    body,
    data: { target: "home" },
    android: {
      channelId: CH_EVENING,
      smallIcon: "ic_launcher",
      pressAction: { id: "default", launchActivity: "default" },
      actions: [
        { title: "Review Today", pressAction: { id: "review-today", launchActivity: "default" } },
      ],
    },
  });
}

// ─── Streak protection ────────────────────────────────────────────────────────

export async function checkStreakProtection(settings: any, now: Date) {
  if (await areMuted()) return;
  const streakCfg = settings?.smart_notifications?.streak_protection;
  if (!streakCfg?.enabled) return;

  const targetH: number = streakCfg.hour ?? 20;
  if (now.getHours() < targetH) return;
  if (wasSent("streak_protection")) return;
  markSent("streak_protection");

  try {
    const [streakData, meals] = await Promise.all([
      api.streaks().catch(() => null),
      api.meals(now.toISOString().slice(0, 10)).catch(() => [] as any[]),
    ]);

    const streak = streakData?.meal_streak ?? 0;
    if (streak < 1) return;
    if (Array.isArray(meals) && meals.length > 0) return;

    await notifee.displayNotification({
      id: "streak-protection",
      title: `${plural(streak, "day")} streak — don't stop now \u{1F525}`,
      body: "No meals logged today yet — one entry before midnight keeps it going.",
      data: { target: "meals", action: "add" },
      android: {
        channelId: CH_STREAK,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Log Meal", pressAction: { id: "log-meal", launchActivity: "default" } },
          { title: "Dismiss",  pressAction: { id: "dismiss-streak" } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Book reminder ────────────────────────────────────────────────────────────

export async function checkBookReminder(settings: any, now: Date) {
  if (await areMuted()) return;
  const bookCfg = settings?.smart_notifications?.book_reminder;
  if (!bookCfg?.enabled) return;
  if (isNighttime(now)) return;

  const targetH = bookCfg?.hour ?? 20;
  if (now.getHours() < targetH) return;
  if (wasSent("book_reminder")) return;
  markSent("book_reminder");

  try {
    const books: any[] = await api.books("reading").catch(() => []);
    if (!Array.isArray(books) || books.length === 0) return;

    const book = books[0];
    const title = book.title ?? "your book";
    const truncated = title.length > 28 ? title.slice(0, 25) + "…" : title;

    await notifee.displayNotification({
      id: "book-reminder",
      title: "Reading time 📖",
      body: `You have "${truncated}" in progress — did you get to read today?`,
      data: { target: "life" },
      android: {
        channelId: CH_BOOKS,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Log Reading", pressAction: { id: "log-book", launchActivity: "default" } },
          { title: "Later",       pressAction: { id: "skip-book" } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Medication reminders ─────────────────────────────────────────────────────
// Fires once per time-of-day bucket (morning/midday/evening) when the scheduled
// hour passes and the user hasn't yet logged that slot today.

const DEFAULT_MED_HOURS: Record<string, number> = { morning: 8, midday: 12, evening: 20 };

export async function checkMedicationReminders(settings: any, now: Date) {
  if (await areMuted()) return;
  const medCfg = settings?.health_notifications;
  if (!medCfg?.medication_reminders_enabled) return;

  const slotHours: Record<string, number> = {
    morning: medCfg.medication_morning_hour ?? DEFAULT_MED_HOURS.morning,
    midday:  medCfg.medication_midday_hour  ?? DEFAULT_MED_HOURS.midday,
    evening: medCfg.medication_evening_hour ?? DEFAULT_MED_HOURS.evening,
  };

  const nowH = now.getHours();
  const dueSlots = (Object.entries(slotHours) as [string, number][]).filter(
    ([slot, hour]) => nowH >= hour && !wasSent(`med_reminder_${slot}`)
  );
  if (dueSlots.length === 0) return;

  try {
    const meds: any[] = await api.getMedications();
    if (!Array.isArray(meds) || meds.length === 0) return;

    for (const [slot] of dueSlots) {
      markSent(`med_reminder_${slot}`);
      const dueMeds = meds.filter(
        (m: any) => m.active && m.slots?.some((s: any) => {
          const bucket = ["morning", "midday", "evening"].includes(s.time_of_day) ? s.time_of_day : "custom";
          return bucket === slot && s.dose_log === null;
        })
      );
      if (dueMeds.length === 0) continue;

      const body = dueMeds.length === 1
        ? `Time for ${dueMeds[0].name}${dueMeds[0].dosage ? ` (${dueMeds[0].dosage})` : ""}`
        : `${dueMeds.length} medications due for ${slot}`;

      await notifee.displayNotification({
        id: `med-reminder-${slot}`,
        title: "Medication reminder",
        body,
        data: { target: "health", action: "medication" },
        android: {
          channelId: CH_MEDS,
          smallIcon: "ic_launcher",
          pressAction: { id: "default", launchActivity: "default" },
          actions: [
            { title: "Open app", pressAction: { id: "open-health", launchActivity: "default" } },
            { title: "Later",    pressAction: { id: `skip-med-${slot}` } },
          ],
        },
      });
    }
  } catch (_) {}
}

// ─── Cycle reminders ──────────────────────────────────────────────────────────
// Period approaching: fire once per predicted start date (tracked by module var).
// Cycle log reminder: fire once per day at the configured hour if today not logged.

let lastPeriodApproachingFiredFor: string | null = null;

export async function checkCycleReminders(settings: any, now: Date) {
  if (await areMuted()) return;
  const cycleCfg = settings?.health_notifications;

  // Period approaching
  if (cycleCfg?.period_approaching_reminder_enabled !== false) {
    try {
      const prediction = await api.getCyclePrediction();
      if (prediction?.predictedNextStart && prediction.confidence !== "none") {
        const daysUntil = Math.round((new Date(prediction.predictedNextStart).getTime() - now.getTime()) / 86400000);
        const leadDays: number = cycleCfg?.period_approaching_lead_days ?? 2;
        if (daysUntil >= 0 && daysUntil <= leadDays && lastPeriodApproachingFiredFor !== prediction.predictedNextStart) {
          lastPeriodApproachingFiredFor = prediction.predictedNextStart;
          await notifee.displayNotification({
            id: "cycle-period-approaching",
            title: "Cycle",
            body: `Period expected in about ${daysUntil} day${daysUntil === 1 ? "" : "s"}`,
            data: { target: "health", action: "cycle" },
            android: {
              channelId: CH_CYCLE,
              smallIcon: "ic_launcher",
              pressAction: { id: "default", launchActivity: "default" },
            },
          });
        }
      }
    } catch (_) {}
  }

  // Daily cycle log reminder
  if (cycleCfg?.cycle_log_reminders_enabled) {
    const targetH: number = cycleCfg.cycle_log_hour ?? 20;
    if (now.getHours() >= targetH && !isNighttime(now) && !wasSent("cycle_log_reminder")) {
      markSent("cycle_log_reminder");
      try {
        const today = now.toISOString().slice(0, 10);
        const log = await api.getCycleLog(today);
        if (!log) {
          await notifee.displayNotification({
            id: "cycle-log-reminder",
            title: "Cycle tracker",
            body: "Don't forget to log your cycle today.",
            data: { target: "health", action: "cycle" },
            android: {
              channelId: CH_CYCLE,
              smallIcon: "ic_launcher",
              pressAction: { id: "default", launchActivity: "default" },
              actions: [
                { title: "Log now", pressAction: { id: "log-cycle", launchActivity: "default" } },
                { title: "Skip",    pressAction: { id: "skip-cycle" } },
              ],
            },
          });
        }
      } catch (_) {}
    }
  }
}

// ─── Hobby reminder ───────────────────────────────────────────────────────────

export async function checkHobbyReminder(settings: any, now: Date) {
  if (await areMuted()) return;
  const hobbyCfg = settings?.smart_notifications?.hobby_reminder;
  if (!hobbyCfg?.enabled) return;
  if (isNighttime(now)) return;

  const targetH = hobbyCfg?.hour ?? 17;
  if (now.getHours() < targetH) return;
  if (wasSent("hobby_reminder")) return;
  markSent("hobby_reminder");

  try {
    const hobbies: any[] = await api.hobbies().catch(() => []);
    if (!Array.isArray(hobbies) || hobbies.length === 0) return;

    const hobby = hobbies[0];
    const name = hobby.name ?? "your hobby";

    await notifee.displayNotification({
      id: "hobby-reminder",
      title: "Activity time",
      body: `Any ${name} today? Tap to log it.`,
      data: { target: "life" },
      android: {
        channelId: CH_HOBBIES,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Log Activity", pressAction: { id: "log-hobby", launchActivity: "default" } },
          { title: "Later",        pressAction: { id: "skip-hobby" } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Rest timer done ──────────────────────────────────────────────────────────
// Called directly from ExerciseSessionScreen when countdown reaches 0.

export async function fireRestTimerDone() {
  await notifee.displayNotification({
    id: "rest-timer-done",
    title: "Rest done 💪",
    body: "Time for your next set — tap to return to your workout.",
    data: { target: "exercise" },
    android: {
      channelId: CH_EXERCISE,
      smallIcon: "ic_launcher",
      pressAction: { id: "default", launchActivity: "default" },
      actions: [
        { title: "Back to workout", pressAction: { id: "default", launchActivity: "default" } },
      ],
    },
  });
}

// ─── Glucose threshold alerts ─────────────────────────────────────────────────
// Separate from the spike alert — fires when current reading crosses a hard
// hypo or hyper boundary. Uses its own per-type cooldown.

let lastHypoCooldownMs = 0;
let lastHyperCooldownMs = 0;
let lastTrendCooldownMs = 0;
const GLUCOSE_THRESHOLD_COOLDOWN_MS = 30 * 60 * 1000; // 30 min per alert type
const GLUCOSE_TREND_COOLDOWN_MS = 20 * 60 * 1000; // shorter — the point is *early* warning

/**
 * Early-warning glucose alert: not yet out of range, but trending into trouble.
 * Fires when reading is elevated AND rising, or dropping toward low AND falling.
 * Separate toggle from the hard low/high threshold — this one is proactive.
 */
export async function checkGlucoseTrendAlert(settings: any, now: Date) {
  if (await areMuted()) return;
  const cfg = settings?.smart_notifications?.glucose_trend_alert;
  if (!cfg?.enabled) return;
  if (now.getTime() - lastTrendCooldownMs < GLUCOSE_TREND_COOLDOWN_MS) return;

  try {
    const status: any = await api.glucoseStatus();
    if (!status?.hasData || status.mg_dl == null || status.isStale) return;
    const mg = Number(status.mg_dl);
    const trend: string = status.trend ?? "";
    const delta = status.delta != null ? Number(status.delta) : null;
    const rising = /Up/.test(trend) || (delta != null && delta >= 10);
    const falling = /Down/.test(trend) || (delta != null && delta <= -10);

    let title: string | null = null;
    let body: string | null = null;
    if (mg > 140 && mg <= 180 && rising) {
      title = `Glucose rising — ${mg} mg/dL ${status.arrow ?? "↗"}`;
      body = "Trending toward high. A short walk or water may help.";
    } else if (mg < 90 && mg >= 70 && falling) {
      title = `Glucose dropping — ${mg} mg/dL ${status.arrow ?? "↘"}`;
      body = "Trending toward low. Consider a small snack.";
    }
    if (!title) return;

    lastTrendCooldownMs = now.getTime();
    await notifee.displayNotification({
      id: "glucose-trend",
      title,
      body: body!,
      data: { target: "health" },
      android: {
        channelId: CH_GLUCOSE,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
      },
    });
  } catch (_) {}
}

export async function checkGlucoseThreshold(settings: any, now: Date) {
  if (await areMuted()) return;
  const cfg = settings?.smart_notifications?.glucose_threshold;
  if (!cfg?.enabled) return;

  const lowThreshold: number = cfg.low_mg_dl ?? 70;
  const highThreshold: number = cfg.high_mg_dl ?? 250;

  try {
    const status = await api.glucoseStatus();
    if (!status?.hasData || status.mg_dl == null) return;
    const mg = Number(status.mg_dl);

    if (mg < lowThreshold && now.getTime() - lastHypoCooldownMs > GLUCOSE_THRESHOLD_COOLDOWN_MS) {
      lastHypoCooldownMs = now.getTime();
      await notifee.displayNotification({
        id: "glucose-low",
        title: `Low glucose ⚠️ ${mg} mg/dL`,
        body: `Your reading of ${mg} mg/dL is below ${lowThreshold} mg/dL. Consider having a snack.`,
        data: { target: "health" },
        android: {
          channelId: CH_GLUCOSE,
          smallIcon: "ic_launcher",
          pressAction: { id: "default", launchActivity: "default" },
          actions: [
            { title: "Log Snack", pressAction: { id: "log-meal", launchActivity: "default" } },
            { title: "Dismiss",   pressAction: { id: "dismiss-glucose-low" } },
          ],
        },
      });
    } else if (mg > highThreshold && now.getTime() - lastHyperCooldownMs > GLUCOSE_THRESHOLD_COOLDOWN_MS) {
      lastHyperCooldownMs = now.getTime();
      await notifee.displayNotification({
        id: "glucose-high",
        title: `High glucose ⚠️ ${mg} mg/dL`,
        body: `Your reading of ${mg} mg/dL is above ${highThreshold} mg/dL.`,
        data: { target: "health" },
        android: {
          channelId: CH_GLUCOSE,
          smallIcon: "ic_launcher",
          pressAction: { id: "default", launchActivity: "default" },
          actions: [
            { title: "Dismiss", pressAction: { id: "dismiss-glucose-high" } },
          ],
        },
      });
    }
  } catch (_) {}
}

// ─── Spending alerts ──────────────────────────────────────────────────────────
// Fires once per day if today's spending has exceeded the configured budget.

export async function checkSpendingAlerts(settings: any, now: Date) {
  if (await areMuted()) return;
  const cfg = settings?.smart_notifications?.spending_alerts;
  if (!cfg?.enabled) return;
  if (isNighttime(now)) return;
  if (wasSent("spending_alert")) return;

  const budget: number = cfg.daily_budget ?? 100;
  const today = now.toISOString().slice(0, 10);

  try {
    const transactions: any[] = await api.spending(today).catch(() => []);
    if (!Array.isArray(transactions) || transactions.length === 0) return;

    const todayTotal = transactions
      .filter((t: any) => {
        const d = (t.date ?? t.spent_at ?? "").slice(0, 10);
        return d === today;
      })
      .reduce((sum: number, t: any) => sum + Math.abs(Number(t.amount ?? 0)), 0);

    if (todayTotal < budget) return;
    markSent("spending_alert");

    await notifee.displayNotification({
      id: "spending-alert",
      title: "Daily budget reached 💳",
      body: `You've spent $${todayTotal.toFixed(2)} today — over your $${budget} daily budget.`,
      data: { target: "finance" },
      android: {
        channelId: CH_SPENDING,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Review", pressAction: { id: "default", launchActivity: "default" } },
          { title: "Dismiss", pressAction: { id: "dismiss-spending" } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Mindfulness reminder ─────────────────────────────────────────────────────
// Simple once-per-day nudge to practice. Fires at a configurable hour.

export async function checkMindfulnessReminder(settings: any, now: Date) {
  if (await areMuted()) return;
  const cfg = settings?.smart_notifications?.mindfulness_reminder;
  if (!cfg?.enabled) return;
  if (isNighttime(now)) return;

  const targetH: number = cfg.hour ?? 20;
  if (now.getHours() < targetH) return;
  if (wasSent("mindfulness_reminder")) return;
  markSent("mindfulness_reminder");

  const messages = [
    "A few minutes of breathing or meditation can shift your whole evening.",
    "Take a moment to check in with yourself — a quick body scan or breath session is waiting.",
    "Even two minutes of mindful breathing makes a difference.",
    "Your mindfulness practice is one tap away — want to unwind?",
  ];
  const body = messages[now.getDate() % messages.length];

  await notifee.displayNotification({
    id: "mindfulness-reminder",
    title: "Mindfulness moment 🧘",
    body,
    data: { target: "mindfulness" },
    android: {
      channelId: CH_MINDFULNESS,
      smallIcon: "ic_launcher",
      pressAction: { id: "default", launchActivity: "default" },
      actions: [
        { title: "Open app", pressAction: { id: "default", launchActivity: "default" } },
        { title: "Later",    pressAction: { id: "skip-mindfulness" } },
      ],
    },
  });
}

// ─── Sleep / bedtime reminder ─────────────────────────────────────────────────
// Fires once at the user's configured bedtime hour.

// Median-bedtime cache — one sleepStats fetch per day, at most.
let _medianBedtimeMins: number | null = null;
let _medianBedtimeDay = "";

async function adaptiveBedtimeMins(now: Date): Promise<number | null> {
  const day = now.toDateString();
  if (_medianBedtimeDay !== day) {
    _medianBedtimeDay = day;
    _medianBedtimeMins = null;
    try {
      const s: any = await api.sleepStats();
      const m = s?.schedule_30d?.median_bedtime_mins;
      if (typeof m === "number" && isFinite(m)) _medianBedtimeMins = m;
    } catch {}
  }
  return _medianBedtimeMins;
}

export async function checkSleepReminder(settings: any, now: Date) {
  if (await areMuted()) return;
  const cfg = settings?.smart_notifications?.sleep_reminder;
  if (!cfg?.enabled) return;

  let targetH: number;
  if (cfg.hour != null) {
    targetH = cfg.hour;
    if (now.getHours() < targetH) return;
  } else {
    // No configured hour — nudge 30 min before the user's 30-day median
    // bedtime (falls back to 22:00 if there isn't enough sleep data).
    const median = await adaptiveBedtimeMins(now);
    const nudgeMins = median != null ? (median - 30 + 1440) % 1440 : 22 * 60;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    // After-midnight bedtimes (nudge < 4am): only fire between the nudge time
    // and 4am, otherwise a 00:30 median would make the check pass all day.
    const due = nudgeMins >= 240 ? nowMins >= nudgeMins : nowMins >= nudgeMins && nowMins < 240;
    if (!due) return;
  }

  if (wasSent("sleep_reminder")) return;
  markSent("sleep_reminder");

  const messages = [
    "Winding down soon? Consistent sleep times help your rhythm.",
    "Getting close to bedtime — try to start your wind-down routine.",
    "A good night's sleep starts with a consistent bedtime.",
  ];
  const body = messages[now.getDate() % messages.length];

  await notifee.displayNotification({
    id: "sleep-reminder",
    title: "Bedtime 😴",
    body,
    data: { target: "health" },
    android: {
      channelId: CH_SLEEP,
      smallIcon: "ic_launcher",
      pressAction: { id: "default", launchActivity: "default" },
      actions: [
        { title: "Dismiss", pressAction: { id: "dismiss-sleep" } },
      ],
    },
  });
}

// ─── Workout reminder ─────────────────────────────────────────────────────────
// Fires once per day (afternoon) if the user hasn't had a completed workout
// session in the configured number of days.

export async function checkWorkoutReminder(settings: any, now: Date) {
  if (await areMuted()) return;
  const cfg = settings?.smart_notifications?.workout_reminder;
  if (!cfg?.enabled) return;
  if (isNighttime(now)) return;

  const targetH = 15; // 3pm — enough time in the day to act on it
  if (now.getHours() < targetH) return;
  if (wasSent("workout_reminder")) return;
  markSent("workout_reminder");

  const daysThreshold: number = cfg.days_threshold ?? 3;

  try {
    const sessions: any[] = await api.listExerciseSessions(5, 0).catch(() => []);
    const completed = Array.isArray(sessions) ? sessions.filter((s: any) => !!s.ended_at) : [];
    if (completed.length === 0) return; // never worked out — don't nag

    const lastMs = new Date(completed[0].ended_at ?? completed[0].started_at).getTime();
    const daysSince = (now.getTime() - lastMs) / 86400000;
    if (daysSince < daysThreshold) return;

    const days = Math.floor(daysSince);
    await notifee.displayNotification({
      id: "workout-reminder",
      title: "Time to move 🏋️",
      body: `It's been ${plural(days, "day")} since your last workout — want to start a session today?`,
      data: { target: "exercise" },
      android: {
        channelId: CH_EXERCISE,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Start workout", pressAction: { id: "default", launchActivity: "default" } },
          { title: "Later",         pressAction: { id: "skip-workout" } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Step goal ────────────────────────────────────────────────────────────────
// Fires once when the user is 80%+ toward their goal but hasn't hit it yet,
// and once more as a celebration when the goal is reached.

const stepCelebrationSent = new Set<string>();

export async function checkStepGoal(settings: any, now: Date) {
  if (await areMuted()) return;
  const cfg = settings?.smart_notifications?.step_goal;
  if (!cfg?.enabled) return;
  if (isNighttime(now)) return;
  if (now.getHours() < 10) return; // wait until mid-morning

  const goal: number = cfg.goal ?? 10000;
  const today = now.toISOString().slice(0, 10);
  const todayKey = `steps_${today}`;

  try {
    const data = await api.stepsToday(today).catch(() => null);
    const steps = typeof data === "number" ? data
      : (data as any)?.count ?? (data as any)?.steps ?? null;
    if (steps === null || steps === undefined) return;
    const count = Number(steps);
    if (isNaN(count) || count <= 0) return;

    const pct = count / goal;

    // Celebration — once per day when goal hit
    const celebKey = `${todayKey}_done`;
    if (count >= goal && !stepCelebrationSent.has(celebKey)) {
      stepCelebrationSent.add(celebKey);
      await notifee.displayNotification({
        id: "step-goal-done",
        title: `Step goal reached! 🎉`,
        body: `You hit ${count.toLocaleString()} steps today — goal crushed.`,
        data: { target: "health" },
        android: {
          channelId: CH_EXERCISE,
          smallIcon: "ic_launcher",
          pressAction: { id: "default", launchActivity: "default" },
        },
      });
      return;
    }

    // Close-to-goal nudge — once per day when 80–99%
    const nudgeKey = `${todayKey}_nudge`;
    if (pct >= 0.8 && pct < 1.0 && !stepCelebrationSent.has(nudgeKey)) {
      stepCelebrationSent.add(nudgeKey);
      const remaining = goal - count;
      await notifee.displayNotification({
        id: "step-goal-close",
        title: `Almost there! ${count.toLocaleString()} steps`,
        body: `Only ${remaining.toLocaleString()} more steps to hit your ${goal.toLocaleString()} goal.`,
        data: { target: "health" },
        android: {
          channelId: CH_EXERCISE,
          smallIcon: "ic_launcher",
          pressAction: { id: "default", launchActivity: "default" },
        },
      });
    }
  } catch (_) {}
}

// ─── Low streak danger ────────────────────────────────────────────────────────
// Fires at 9pm if any active streak hasn't been logged today yet.

export async function checkLowStreakDanger(now: Date) {
  if (await areMuted()) return;
  if (now.getHours() < 21) return;
  if (wasSent("low_streak_danger")) return;
  markSent("low_streak_danger");

  try {
    const streakData = await api.streaks().catch(() => null);
    if (!streakData) return;

    const today = now.toISOString().slice(0, 10);
    const [meals, stepsMeta, exerciseSessions, readingLogs] = await Promise.all([
      api.meals(today).catch(() => [] as any[]),
      api.stepsToday(today).catch(() => null),
      api.listExerciseSessions(1, 0).catch(() => [] as any[]),
      (api as any).readingToday?.(today).catch(() => null),
    ]);

    const hasMeals = Array.isArray(meals) && meals.length > 0;
    const hasSteps = stepsMeta != null && Number(stepsMeta?.count ?? stepsMeta) > 0;
    const hasExercise = Array.isArray(exerciseSessions) && exerciseSessions.some(
      (s: any) => s.started_at?.slice(0, 10) === today
    );

    const atRisk: string[] = [];
    if (streakData.meal_streak >= 3 && !hasMeals) atRisk.push("meals");
    if (streakData.steps_streak >= 3 && !hasSteps) atRisk.push("steps");
    if (streakData.exercise_streak >= 3 && !hasExercise) atRisk.push("workout");
    if (streakData.reading_streak >= 3) atRisk.push("reading");

    if (atRisk.length === 0) return;

    const streakWord = atRisk.length === 1
      ? "your " + atRisk[0] + " streak"
      : atRisk.slice(0, -1).join(", ") + " & " + atRisk[atRisk.length - 1] + " streaks";

    await notifee.displayNotification({
      id: "low-streak-danger",
      title: "Streaks at risk 🔥",
      body: `Log something before midnight to keep ${streakWord} alive.`,
      data: { target: "home" },
      android: {
        channelId: CH_STREAK,
        smallIcon: "ic_launcher",
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          { title: "Open app", pressAction: { id: "default", launchActivity: "default" } },
          { title: "Dismiss",  pressAction: { id: "dismiss-streak-danger" } },
        ],
      },
    });
  } catch (_) {}
}

// ─── Scheduled medication reminders ──────────────────────────────────────────
// Creates one daily repeating trigger notification per med+time slot.
// Cancels all previous med_reminder triggers before rescheduling.

function nextOccurrence(h: number, m: number): number {
  const now = new Date();
  const t = new Date(now);
  t.setHours(h, m, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t.getTime();
}

export async function scheduleMedicationReminders(
  meds: Array<{ id: string; name: string }>,
  reminders: Record<string, string[]>
) {
  const existing = await notifee.getTriggerNotifications();
  for (const n of existing) {
    if ((n.notification.data as any)?.type === "med_reminder") {
      await notifee.cancelTriggerNotification(n.notification.id!);
    }
  }
  for (const med of meds) {
    for (const t of reminders[med.id] ?? []) {
      const [h, m] = t.split(":").map(Number);
      await notifee.createTriggerNotification(
        {
          title: "Medication reminder",
          body: `Time to take ${med.name}`,
          android: { channelId: CH_MEDS, smallIcon: "ic_launcher" },
          data: { type: "med_reminder", medId: med.id },
        },
        { type: TriggerType.TIMESTAMP, timestamp: nextOccurrence(h, m), repeatFrequency: RepeatFrequency.DAILY }
      );
    }
  }
}

// ─── Weekly digest notification ───────────────────────────────────────────────

function isoWeek(d: Date): string {
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const weekNum = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export async function maybeFireWeeklyDigest(enabled: boolean, digest: {
  steps: { this_week: number };
  exercise?: { sessions_this_week: number; total_minutes_this_week: number };
  books?: { finished_this_month: number };
  hobbies?: { this_week_sessions: number };
}) {
  if (!enabled) return;
  const dow = new Date().getDay(); // 0=Sun, 1=Mon
  if (dow !== 0 && dow !== 1) return;

  const key = `weekly_digest_notif_${isoWeek(new Date())}`;
  const already = await AsyncStorage.getItem(key);
  if (already) return;
  await AsyncStorage.setItem(key, "1");

  const parts: string[] = [];
  if (digest.steps.this_week > 0) parts.push(`${digest.steps.this_week.toLocaleString()} steps`);
  if (digest.exercise?.sessions_this_week) parts.push(`${digest.exercise.sessions_this_week} workout${digest.exercise.sessions_this_week === 1 ? "" : "s"}`);
  if (digest.hobbies?.this_week_sessions) parts.push(`${digest.hobbies.this_week_sessions} hobby session${digest.hobbies.this_week_sessions === 1 ? "" : "s"}`);
  if (digest.books?.finished_this_month) parts.push(`${digest.books.finished_this_month} book${digest.books.finished_this_month === 1 ? "" : "s"} this month`);

  if (parts.length === 0) return;

  await notifee.displayNotification({
    title: "Your week in review",
    body: parts.join(" · "),
    android: { channelId: CH_WEEKLY, smallIcon: "ic_notification", pressAction: { id: "default" } },
  });
}

// ─── Sunday-evening week-ahead prompt ────────────────────────────────────────
// One gentle nudge Sunday between 6-9pm asking "any workouts to schedule
// this week?". Deep-links to the exercise plan builder. Idempotent per week
// via the same isoWeek AsyncStorage key pattern as the digest above.
export async function maybeFireSundayWeekAheadPrompt() {
  if (await areMuted()) return;
  const now = new Date();
  if (now.getDay() !== 0) return;               // Sunday only
  if (now.getHours() < 18 || now.getHours() >= 21) return;

  const key = `sunday_prompt_${isoWeek(now)}`;
  const already = await AsyncStorage.getItem(key);
  if (already) return;
  await AsyncStorage.setItem(key, "1");

  await notifee.displayNotification({
    title: "Plan your week?",
    body: "Any workouts you want to line up for the week ahead?",
    data: { target: "exercise" },
    android: {
      channelId: CH_WEEKLY,
      smallIcon: "ic_notification",
      pressAction: { id: "default", launchActivity: "default" },
    },
  });
}
