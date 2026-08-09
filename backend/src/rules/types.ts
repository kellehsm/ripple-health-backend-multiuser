export interface InsightResult {
  title: string;
  description: string;
  confidence: "low" | "moderate" | "high" | "very_high";
  confidenceScore: number;
  supportingData: Record<string, unknown>;
  timesObserved: number;
  // Optional stats fields. Rules that use welchTTest/mannWhitneyU populate
  // these so the engine can apply FDR correction and MDE gates uniformly.
  pValue?: number;
  effectSize?: number;
  ci95?: [number, number];
  // Rule-level metadata (defaults filled by engine if omitted).
  actionable?: boolean;
  clinicalRisk?: boolean;
  primaryMetric?: string;   // e.g. "mood_score", "glucose_mg_dl"
}

// Pre-flight capability flags fetched once per user before running all rules.
// Rules that require data the user doesn't have can skip their DB query immediately.
export interface UserCapabilities {
  has_substances: boolean;
  has_cycle: boolean;
  has_hr: boolean;
  has_glucose: boolean;
  has_medications: boolean;
  medication_slots_count: number; // 0 if no active slots
}

export type RuleTier = "daily" | "semiweekly" | "weekly";

export interface InsightRule {
  readonly id: string;
  readonly type: string;
  readonly minDays: number;
  // Bumped on any algorithm change so shadow-mode can compare versions.
  readonly version?: number;
  // Scheduling tier. Defaults to "semiweekly" for backwards compat.
  readonly tier?: RuleTier;
  // A/B variant tag. When null, the rule runs unconditionally.
  readonly variant?: string;
  // Rule-level metadata, mirrored onto the result for UI/ranking.
  readonly actionable?: boolean;
  readonly clinicalRisk?: boolean;
  readonly primaryMetric?: string;
  run(userId: string, capabilities?: UserCapabilities): Promise<InsightResult | null>;
  // Optional context-aware entrypoint. Engine calls this when defined,
  // otherwise falls back to run(). Frame-based rules should implement this
  // so they skip their own DB queries.
  runWithContext?(ctx: {
    userId: string;
    capabilities: UserCapabilities;
    frame: import("../services/dayFrame.js").DayFrame;
    currentTier: RuleTier;
    now: Date;
  }): Promise<InsightResult | null>;
}

export function confidenceFromScore(score: number): "low" | "moderate" | "high" | "very_high" {
  if (score >= 75) return "very_high";
  if (score >= 50) return "high";
  if (score >= 25) return "moderate";
  return "low";
}

// sampleSize saturates at 30; effectRatio is 0–1 (e.g. 0.15 = 15% difference)
export function calcConfidence(sampleSize: number, effectRatio: number): { score: number; label: "low" | "moderate" | "high" | "very_high" } {
  const sampleFactor = Math.min(1, sampleSize / 30);
  const effectFactor = Math.min(1, effectRatio / 0.3); // 30% difference = max effect
  const score = Math.round(sampleFactor * 60 + effectFactor * 40);
  return { score, label: confidenceFromScore(score) };
}
