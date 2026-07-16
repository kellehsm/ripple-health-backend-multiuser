export interface InsightResult {
  title: string;
  description: string;
  confidence: "low" | "moderate" | "high" | "very_high";
  confidenceScore: number;
  supportingData: Record<string, unknown>;
  timesObserved: number;
}

export interface InsightRule {
  readonly id: string;
  readonly type: string;
  readonly minDays: number;
  run(userId: string): Promise<InsightResult | null>;
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
