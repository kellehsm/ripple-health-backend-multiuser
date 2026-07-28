export type CardId =
  | "metric_chips"
  | "trends_nav"
  | "daily_summary"
  | "top_insight"
  | "timeline"
  | "insights"
  | "weekly_review"
  | "mood_pattern"
  | "cross_metric";

export type DashboardCard = {
  id: CardId;
  label: string;
  description: string;
};

export const DASHBOARD_CARDS: DashboardCard[] = [
  { id: "metric_chips",  label: "Key metrics",         description: "Glucose, steps, sleep, water, meals & mood chips" },
  { id: "trends_nav",   label: "Trends & Insights",    description: "Quick-nav card to the Trends tab" },
  { id: "daily_summary",label: "Daily summary",         description: "AI-generated daily health summary" },
  { id: "top_insight",  label: "Top insight",          description: "Latest AI insight preview" },
  { id: "timeline",     label: "Today's timeline",     description: "Glucose chart + chronological event feed" },
  { id: "insights",     label: "Insights",             description: "Pattern observations for today" },
  { id: "weekly_review",label: "7-day review",         description: "Steps, glucose avg, hobbies & flags this week" },
  { id: "mood_pattern",  label: "Mood pattern",          description: "7-day mood vs sleep/spending bar chart" },
  { id: "cross_metric", label: "Cross-metric insights", description: "How exercise and sleep relate to your glucose averages" },
];

export const DEFAULT_CARD_ORDER: CardId[] = DASHBOARD_CARDS.map(c => c.id);

export type DashboardLayout = {
  order: CardId[];
  hidden: CardId[];
};

export function resolveLayout(raw: Partial<DashboardLayout> | undefined): DashboardLayout {
  const order = (raw?.order ?? DEFAULT_CARD_ORDER).filter((id): id is CardId =>
    DASHBOARD_CARDS.some(c => c.id === id)
  );
  // Add any new cards not yet in saved order to the end
  for (const c of DASHBOARD_CARDS) {
    if (!order.includes(c.id)) order.push(c.id);
  }
  return { order, hidden: raw?.hidden ?? [] };
}
