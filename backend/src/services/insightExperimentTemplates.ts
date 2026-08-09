/**
 * Maps insight rule_id → experiment scaffold. Every rule that could plausibly
 * be tested with a 14–28 day self-experiment has a template here.
 *
 * When a template is missing, `autoGenerateTemplate` synthesizes one from
 * the insight's supporting_data (direction + primary metric).
 */

export interface ExperimentTemplate {
  description: string;
  duration_days: number;
  metrics: string[];
}

const TEMPLATES: Record<string, ExperimentTemplate> = {
  // Sleep
  sleep_vs_mood:            { description: "Aim for 7+ hours of sleep for the next 2 weeks and track mood.",   duration_days: 14, metrics: ["sleep_minutes", "mood_score"] },
  sleep_vs_glucose:         { description: "Prioritize sleep quality for 2 weeks and watch morning glucose.", duration_days: 14, metrics: ["sleep_quality", "glucose_average"] },
  sleep_vs_steps:           { description: "Protect 7+ hours sleep for 2 weeks and see if step counts rise.", duration_days: 14, metrics: ["sleep_minutes", "steps"] },
  sleep_vs_spending:        { description: "Prioritize sleep for 2 weeks and observe next-day spending.",     duration_days: 14, metrics: ["sleep_minutes", "spending_total"] },
  sleep_consistency:        { description: "Hold bedtime within a 30-min window for 2 weeks.",                duration_days: 14, metrics: ["bedtime_hour"] },
  meal_size_vs_sleep:       { description: "Keep dinners under 500 calories for 2 weeks; track sleep.",       duration_days: 14, metrics: ["evening_calories", "sleep_quality"] },
  screen_time_vs_sleep:     { description: "Cap screen time to 60 min in the last hour before bed for 2 weeks.", duration_days: 14, metrics: ["screen_time_minutes", "sleep_quality"] },
  late_meals_vs_sleep:      { description: "No meals after 8 PM for 2 weeks; watch sleep quality.",           duration_days: 14, metrics: ["late_meal", "sleep_quality"] },
  lag_sleep_glucose:        { description: "Prioritize 7+ hours sleep for 2 weeks; track morning glucose.",   duration_days: 14, metrics: ["sleep_minutes", "glucose_morning"] },
  sleep_architecture_mood:  { description: "Reduce evening alcohol/caffeine for 2 weeks; track REM & mood.",  duration_days: 14, metrics: ["rem_minutes", "mood_score"] },

  // Substances
  alcohol_quantity_vs_glucose: { description: "Cap drinks at one serving on any drinking night for 2 weeks.", duration_days: 14, metrics: ["alcohol_grams", "morning_glucose"] },
  alcohol_vs_sleep:            { description: "No alcohol for 2 weeks; watch sleep quality.",                 duration_days: 14, metrics: ["alcohol_grams", "sleep_quality"] },
  alcohol_vs_mood:             { description: "No alcohol for 2 weeks; watch mood.",                          duration_days: 14, metrics: ["alcohol_grams", "mood_score"] },
  caffeine_vs_sleep:           { description: "Cut off caffeine by 2 PM for 2 weeks; track sleep.",           duration_days: 14, metrics: ["caffeine_mg", "sleep_quality"] },
  caffeine_vs_glucose:         { description: "Halve morning caffeine for 2 weeks; track glucose.",           duration_days: 14, metrics: ["caffeine_mg", "glucose_average"] },
  caffeine_dose_response:      { description: "Keep daily caffeine under threshold for 2 weeks; track sleep.", duration_days: 14, metrics: ["caffeine_mg", "sleep_quality"] },

  // Activity
  activity_vs_glucose:      { description: "Hit 8,000+ steps on more days for 2 weeks; watch glucose.",       duration_days: 14, metrics: ["steps", "glucose_average"] },
  steps_vs_mood:            { description: "Aim for 8,000+ steps for 2 weeks; track mood.",                   duration_days: 14, metrics: ["steps", "mood_score"] },
  exercise_vs_mood:         { description: "Log any exercise 4+ days/week for 2 weeks; track mood.",          duration_days: 14, metrics: ["exercise_sessions", "mood_score"] },
  exercise_consistency:     { description: "Log at least one workout every other day for 2 weeks.",           duration_days: 14, metrics: ["exercise_sessions"] },
  resting_hr_vs_exercise:   { description: "Aim for 30 min exercise 5 days/week for 3 weeks; track HR.",      duration_days: 21, metrics: ["exercise_sessions", "resting_hr"] },
  weather_vs_exercise:      { description: "Commit to an indoor session on rainy days for 3 weeks.",          duration_days: 21, metrics: ["exercise_sessions", "weather_condition"] },
  muscle_group_rotation:    { description: "Train the flagged muscle group in your next two sessions.",       duration_days: 14, metrics: ["exercise_sessions"] },
  recovery_day_pattern:     { description: "Insert a full rest day after any 2 consecutive training days.",   duration_days: 21, metrics: ["exercise_sessions", "steps"] },
  undertrained_muscle:      { description: "Add one workout targeting the undertrained muscle each week.",    duration_days: 21, metrics: ["exercise_sessions"] },

  // Nutrition / hydration
  meal_glucose_type:        { description: "Swap one flagged meal type for 2 weeks; watch glucose.",          duration_days: 14, metrics: ["meal_types", "glucose_average"] },
  meal_skipping_vs_mood:    { description: "Eat within 2 hours of waking every day for 2 weeks.",             duration_days: 14, metrics: ["meal_count", "mood_score"] },
  meal_composition_glucose: { description: "Reduce the flagged macro by 20% for 2 weeks; track glucose.",     duration_days: 14, metrics: ["carbs_g", "glucose_average"] },
  water_vs_mood:            { description: "Hit 6+ glasses water daily for 2 weeks; track mood.",             duration_days: 14, metrics: ["water_glasses", "mood_score"] },
  water_consistency:        { description: "Log water 5+ times/day for 2 weeks.",                             duration_days: 14, metrics: ["water_glasses"] },
  glucose_variability:      { description: "Aim for consistent meal timing/composition for 3 weeks.",         duration_days: 21, metrics: ["glucose_cv"] },
  glucose_time_of_day:      { description: "Adjust the timing of the flagged meal for 2 weeks.",              duration_days: 14, metrics: ["glucose_average"] },

  // Mindfulness / hobbies
  mindfulness_vs_mood:      { description: "Log a 5-min mindfulness session every day for 2 weeks.",          duration_days: 14, metrics: ["mindfulness_sessions", "mood_score"] },
  mindfulness_vs_glucose:   { description: "Add 10 min of mindfulness before dinner for 2 weeks.",            duration_days: 14, metrics: ["mindfulness_sessions", "glucose_average"] },
  mindfulness_vs_resting_hr:{ description: "Do 10 min of breathwork daily for 3 weeks; track resting HR.",    duration_days: 21, metrics: ["mindfulness_sessions", "resting_hr"] },
  mindfulness_vs_spending:  { description: "Do 5 min of mindfulness before any purchase for 2 weeks.",        duration_days: 14, metrics: ["mindfulness_sessions", "spending_total"] },
  mood_journaling_streak:   { description: "Journal at least once a day for 2 weeks.",                        duration_days: 14, metrics: ["mood_score"] },
  hobby_vs_mood:            { description: "Schedule a hobby session 4+ days/week for 2 weeks.",              duration_days: 14, metrics: ["hobby_sessions", "mood_score"] },
  reading_vs_mood:          { description: "Read for at least 15 min daily for 2 weeks; track mood.",         duration_days: 14, metrics: ["pages_read", "mood_score"] },

  // Spending
  time_of_day_spend:        { description: "Impose a spending pause during your peak spending window.",       duration_days: 14, metrics: ["spending_total"] },
  stress_vs_spending:       { description: "On high-stress days, defer non-essential purchases by 24h.",      duration_days: 14, metrics: ["stress_score", "spending_total"] },
  spending_vs_mood:         { description: "Set a daily spending cap for 2 weeks; track mood.",               duration_days: 14, metrics: ["spending_total", "mood_score"] },
  weekend_spending:         { description: "Pre-plan weekend spend budget for 3 weeks.",                      duration_days: 21, metrics: ["spending_total"] },
  weekly_rhythm_spend:      { description: "Impose a no-spend rule on your peak day for 2 weeks.",            duration_days: 14, metrics: ["spending_total"] },
  hobbies_vs_spending:      { description: "Track hobby spend separately for 2 weeks.",                       duration_days: 14, metrics: ["spending_total"] },
  spending_cycle_phase:     { description: "Set a spending pause during your flagged cycle phase.",           duration_days: 28, metrics: ["spending_total"] },

  // Cycle / medication
  medication_adherence:     { description: "Set a fixed daily reminder for each dose for 2 weeks.",           duration_days: 14, metrics: ["adherence_pct"] },
  missed_slot:              { description: "Set a phone alarm for the flagged slot for 2 weeks.",             duration_days: 14, metrics: ["adherence_pct"] },
  medication_vs_mood:       { description: "Track mood before and after taking meds each day for 2 weeks.",   duration_days: 14, metrics: ["mood_score"] },

  // Trends & composites
  weekly_rhythm_mood:       { description: "Reserve extra recovery on your flagged day for 2 weeks.",         duration_days: 14, metrics: ["mood_score"] },
  habit_clusters_best_days: { description: "Do the flagged habit combo every day for 2 weeks.",               duration_days: 14, metrics: ["mood_score"] },
  worst_days_common:        { description: "Avoid the flagged pattern every day for 2 weeks.",                duration_days: 14, metrics: ["mood_score"] },
  time_of_day_mood:         { description: "Add a mood-boosting activity during your low window for 2 weeks.", duration_days: 14, metrics: ["mood_score"] },
};

export function getExperimentTemplate(ruleId: string): ExperimentTemplate | null {
  return TEMPLATES[ruleId] ?? null;
}

export function listSupportedRules(): string[] {
  return Object.keys(TEMPLATES);
}

/**
 * Auto-generate a lightweight template from a stored insight's supporting_data
 * when no hand-crafted template exists. Uses the `direction` field to nudge
 * the user toward the healthier tail of the distribution.
 */
export function autoGenerateTemplate(ruleId: string, supportingData: any): ExperimentTemplate {
  const primary = supportingData?.primary_metric ?? "mood_score";
  const direction = supportingData?.direction ?? "higher";
  const nudge = direction === "higher" ? "lean into the pattern" : "reduce the flagged behavior";
  return {
    description: `Track this pattern for 2 weeks and ${nudge}, then compare against your baseline.`,
    duration_days: 14,
    metrics: [primary],
  };
}
