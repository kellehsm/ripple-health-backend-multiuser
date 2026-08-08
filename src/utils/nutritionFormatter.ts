// ─── Nutrition Formatting ─────────────────────────────────────────────────────
// Extracted from MealsScreen.tsx — canonical nutrition display formatting.

/**
 * Formats nutrition values into a human-readable string like:
 *   "350 cal · 42g carbs · 12g sugar · 180mg sodium · 85mg caffeine"
 *
 * Any null/undefined field is omitted from the output.
 */
export function formatNutrition(
  carbs_g: number | null | undefined,
  sugar_g: number | null | undefined,
  calories: number | null | undefined,
  caffeine_mg?: number | null,
  sodium_mg?: number | null,
): string {
  const parts: string[] = [];
  if (calories != null) parts.push(calories + " cal");
  if (carbs_g != null) parts.push(carbs_g + "g carbs");
  if (sugar_g != null) parts.push(sugar_g + "g sugar");
  if (sodium_mg != null) parts.push(sodium_mg + "mg sodium");
  if (caffeine_mg != null) parts.push(caffeine_mg + "mg caffeine");
  return parts.join(" · ");
}
