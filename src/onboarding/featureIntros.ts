import type { Theme } from "../theme/theme";

// Accent color families defined in every palette.
export type AccentKey =
  | "teal" | "coral" | "blue" | "amber" | "purple" | "berry" | "violet" | "red" | "green";

export interface IntroCard {
  emoji: string;
  title: string;
  body: string;
}

export interface FeatureIntro {
  /** Stable key — used as the AsyncStorage seen-flag suffix. Never rename. */
  key: string;
  /** Shown in the Feature Guide list and as the sheet header. */
  name: string;
  /** Accent color pulled from the active theme. */
  accent: AccentKey;
  /** 2–4 cards, swipeable. */
  cards: IntroCard[];
  /** Label on the last card's primary button. */
  ctaLabel?: string;
}

// Copy is descriptive, not diagnostic. Never phrase as medical advice.
// Cards are short — 2 sentences max each so the sheet fits without scrolling.
export const FEATURE_INTROS: FeatureIntro[] = [
  {
    key: "home",
    name: "Home",
    accent: "berry",
    cards: [
      { emoji: "🏠", title: "Your daily command centre",
        body: "One glance at mood, glucose, steps, water, sleep, and today's ripple score." },
      { emoji: "💧", title: "Log in one tap",
        body: "Every chip is tappable — mood check-ins, water, meals, and workouts start here." },
      { emoji: "✨", title: "AI daily summary",
        body: "Ripple stitches together your day and highlights the moments that mattered." },
    ],
  },
  {
    key: "health",
    name: "Health",
    accent: "teal",
    cards: [
      { emoji: "❤️", title: "All your vitals in one place",
        body: "Glucose, heart rate, sleep, steps, and workouts — synced from Health Connect and Dexcom." },
      { emoji: "📈", title: "Trends, not just numbers",
        body: "Tap any metric for daily / weekly / monthly context and how it compares to your own baseline." },
      { emoji: "💊", title: "Medications & cycle",
        body: "Track doses, refills, and cycle days from here so nothing slips through." },
    ],
  },
  {
    key: "meals",
    name: "Meals",
    accent: "coral",
    cards: [
      { emoji: "🍜", title: "Log in seconds",
        body: "Scan a barcode, search by name, or pick from your history — Ripple fills in the macros." },
      { emoji: "☕", title: "Caffeine & alcohol too",
        body: "Track substances alongside food so you can see how they shift your day." },
      { emoji: "📊", title: "Meals × glucose",
        body: "Ripple overlays your meals on your CGM curve so you can see what actually moves the needle." },
    ],
  },
  {
    key: "insights",
    name: "Insights",
    accent: "violet",
    cards: [
      { emoji: "✨", title: "Patterns Ripple spots for you",
        body: "Every night Ripple mines your data for connections — sleep vs mood, meals vs glucose, and more." },
      { emoji: "🎯", title: "Personalised to your baseline",
        body: "Insights use your own averages, not one-size-fits-all thresholds, so they apply to you." },
      { emoji: "👍", title: "Tell Ripple what's useful",
        body: "Rate insights helpful or not — Ripple learns and stops surfacing ones that don't land." },
    ],
  },
  {
    key: "life",
    name: "Life",
    accent: "blue",
    cards: [
      { emoji: "📖", title: "Books, hobbies, journal",
        body: "The non-metric side of your day — what you're reading, what you love doing, how you're feeling." },
      { emoji: "🔥", title: "Streaks that stick",
        body: "Small daily habits compound. Log a hobby session or a journal entry and watch the streak build." },
      { emoji: "🔗", title: "Hardcover sync",
        body: "Connect Hardcover once — your reading progress pushes and pulls both ways automatically." },
    ],
  },
  {
    key: "finance",
    name: "Finance",
    accent: "purple",
    cards: [
      { emoji: "💰", title: "Spending, mood, wellbeing",
        body: "See how financial stress tracks against sleep, mood, and glucose — patterns you can act on." },
      { emoji: "🏦", title: "Bank sync via Plaid",
        body: "Connect your bank once and transactions land automatically, categorised and ready to review." },
      { emoji: "📆", title: "Budgets, not guilt",
        body: "Set a monthly budget, mark categories you care about, and see the shape of your month at a glance." },
    ],
  },
  {
    key: "exercise",
    name: "Exercise",
    accent: "berry",
    cards: [
      { emoji: "🏋️", title: "Log workouts fast",
        body: "Pick from a library or free-form it. Live sessions get a timer, rest tracker, and set logger." },
      { emoji: "❤️‍🔥", title: "See recovery in context",
        body: "Ripple lines your workouts up with resting heart rate and sleep so you can spot overtraining early." },
      { emoji: "🎯", title: "Programs & progression",
        body: "Follow a program or build your own. Ripple tracks volume and progression so you don't have to." },
    ],
  },
  {
    key: "mindfulness",
    name: "Mindfulness",
    accent: "violet",
    cards: [
      { emoji: "🧘", title: "Short sessions, real signal",
        body: "Guided breathing, body scans, and quiet minutes — logged so you can see the pattern over weeks." },
      { emoji: "🌊", title: "Ties into your day",
        body: "Ripple looks at how mindfulness sessions relate to mood, sleep, and heart-rate variability." },
    ],
  },
  {
    key: "medications",
    name: "Medications",
    accent: "amber",
    cards: [
      { emoji: "💊", title: "Doses, refills, PRNs",
        body: "Track scheduled meds, mark PRNs as-needed, and see refill dates before you run out." },
      { emoji: "🔔", title: "Smart reminders",
        body: "Ripple nudges you at each dose window — one tap logs it, or snooze if you're in the middle of something." },
      { emoji: "📋", title: "Rx info from the FDA",
        body: "Every medication pulls its label, warnings, and generic/brand info from openFDA so you always have context." },
    ],
  },
  {
    key: "cycle",
    name: "Cycle",
    accent: "berry",
    cards: [
      { emoji: "🌸", title: "Predictions from your own history",
        body: "Log period and mood — Ripple learns your typical cycle length and forecasts the next window." },
      { emoji: "🔗", title: "How cycle shapes other metrics",
        body: "See how mood, sleep, and glucose shift across each phase, without needing to eyeball it." },
    ],
  },
  {
    key: "challenges",
    name: "Challenges",
    accent: "teal",
    cards: [
      { emoji: "🏆", title: "Weekly friendly competition",
        body: "Steps, mood check-ins, water — set a goal with friends and see who lands on top." },
      { emoji: "📈", title: "Live leaderboard",
        body: "Rankings update through the week so there's always something to push toward." },
    ],
  },
  {
    key: "friends",
    name: "Friends",
    accent: "coral",
    cards: [
      { emoji: "👥", title: "Add friends, share what you want",
        body: "Fine-grained sharing — pick what's visible (steps, streaks, mood) and what stays private." },
      { emoji: "🎯", title: "Accountability, not surveillance",
        body: "Only the metrics you opt-in to share ever leave your account. You're always in control." },
    ],
  },
  {
    key: "dexcom",
    name: "Dexcom CGM",
    accent: "berry",
    cards: [
      { emoji: "🩸", title: "Live glucose in Ripple",
        body: "Connect once and Ripple pulls a new reading every 5 minutes so your data is never stale." },
      { emoji: "🚨", title: "High / low alerts",
        body: "Set your own thresholds — Ripple pings you before things go too far in either direction." },
    ],
  },
  {
    key: "backup",
    name: "Google Drive backup",
    accent: "blue",
    cards: [
      { emoji: "☁️", title: "Nightly automatic backup",
        body: "Ripple exports all your data to your own Drive at 2am every night — no cloud lock-in." },
      { emoji: "↩️", title: "Restore any time",
        body: "Reinstall the app or switch devices? Restore from any Drive backup in one tap." },
    ],
  },
];

export function findIntro(key: string): FeatureIntro | undefined {
  return FEATURE_INTROS.find((f) => f.key === key);
}

/** Accent → concrete colors from the active theme. */
export function accentColors(theme: Theme, accent: AccentKey) {
  const c = (theme as any)[accent];
  return {
    solid: c?.solid ?? theme.textStrong,
    sub:   c?.sub   ?? theme.textStrong,
    bg:    c?.bg    ?? theme.card,
    fg:    c?.fg    ?? theme.textStrong,
  };
}
