/**
 * Maps insight rule_id → a lightweight experiment scaffold that the "Try
 * this" button can seed. Only rules with a clear actionable direction get
 * templates — the rest just show a "log it" nudge instead.
 *
 * Duration defaults to 14 days. Metrics list drives which daily_summaries
 * fields the experiment tracks.
 */

export interface ExperimentTemplate {
  description: string;
  duration_days: number;
  metrics: string[];         // metric names the experiment tracks
}

const TEMPLATES: Record<string, ExperimentTemplate> = {
  // Sleep-lift experiments
  sleep_vs_mood: {
    description: "Aim for 7+ hours of sleep for the next 2 weeks and track how your mood responds.",
    duration_days: 14,
    metrics: ["sleep_minutes", "mood_score"],
  },
  sleep_vs_glucose: {
    description: "Prioritize sleep quality for 2 weeks and see if morning glucose stabilizes.",
    duration_days: 14,
    metrics: ["sleep_quality", "glucose_average"],
  },
  meal_size_vs_sleep: {
    description: "Keep dinners under 500 calories for 2 weeks and check sleep quality.",
    duration_days: 14,
    metrics: ["evening_calories", "sleep_quality"],
  },
  screen_time_vs_sleep: {
    description: "Cut screen time to under 60 minutes in the last hour before bed for 2 weeks.",
    duration_days: 14,
    metrics: ["screen_time_minutes", "sleep_quality"],
  },
  alcohol_quantity_vs_glucose: {
    description: "Cap drinks at one standard serving on any drinking night for 2 weeks.",
    duration_days: 14,
    metrics: ["alcohol_grams", "morning_glucose"],
  },

  // Activity experiments
  activity_vs_glucose: {
    description: "Hit 8,000+ steps on more days for 2 weeks and watch what happens to glucose.",
    duration_days: 14,
    metrics: ["steps", "glucose_average"],
  },
  weather_vs_exercise: {
    description: "Commit to an indoor movement session on rainy days for 3 weeks.",
    duration_days: 21,
    metrics: ["exercise_sessions", "weather_condition"],
  },
  muscle_group_rotation: {
    description: "Train the flagged muscle group in your next two sessions.",
    duration_days: 14,
    metrics: ["exercise_sessions"],
  },

  // Mindfulness
  mindfulness_vs_mood: {
    description: "Log a 5-minute mindfulness session every day for 2 weeks.",
    duration_days: 14,
    metrics: ["mindfulness_sessions", "mood_score"],
  },

  // Spending
  time_of_day_spend: {
    description: "Impose a spending pause during your peak spending window for 2 weeks.",
    duration_days: 14,
    metrics: ["spending_total"],
  },
  stress_vs_spending: {
    description: "On high-stress days, defer non-essential purchases by 24h for 2 weeks.",
    duration_days: 14,
    metrics: ["stress_score", "spending_total"],
  },
};

export function getExperimentTemplate(ruleId: string): ExperimentTemplate | null {
  return TEMPLATES[ruleId] ?? null;
}

export function listSupportedRules(): string[] {
  return Object.keys(TEMPLATES);
}
