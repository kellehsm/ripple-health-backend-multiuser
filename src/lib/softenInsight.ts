// Client-side safety net: soften backend-generated insight/correlation text so it
// never renders as a medical/causal claim. The backend engine should ideally
// produce observational copy, but if a rule slips through with "X causes Y" this
// keeps the UI aligned with the app's copy guidelines.

// Ordered replacements (case-insensitive, word-boundary respecting).
const RULES: Array<[RegExp, string]> = [
  [/\bcauses\b/gi,          'often precedes'],
  [/\bcaused\b/gi,          'coincided with'],
  [/\bleads to\b/gi,        'tends to correlate with'],
  [/\bresults in\b/gi,      'often coincides with'],
  [/\btriggers\b/gi,        'often precedes'],
  [/\btriggered\b/gi,       'coincided with'],
  [/\bspikes\b/gi,          'often rises alongside'],
  [/\bmakes you\b/gi,       'has correlated with your'],
  [/\bwill\b/gi,            'may'],
  [/\byour ([\w-]+) is\b/gi, 'your $1 has been'],
];

// Standalone hedging inserts — added if the text starts with a strong statement.
const STRONG_OPENERS = /^(you|your)\b/i;

export function softenInsight(text: string | null | undefined): string {
  if (!text) return '';
  let out = String(text).trim();
  for (const [pattern, replacement] of RULES) {
    out = out.replace(pattern, replacement);
  }
  // Hedge sentences that open with a strong "you / your" assertion when no
  // uncertainty marker is present in the first clause.
  if (STRONG_OPENERS.test(out) && !/\b(may|might|tends|often|appears|seems)\b/i.test(out.slice(0, 40))) {
    out = out.replace(STRONG_OPENERS, (m) => `${m.toLowerCase()} may find that`).replace(/^./, (c) => c.toUpperCase());
  }
  return out;
}

export type Confidence = 'low' | 'moderate' | 'high' | 'very_high';

/**
 * Adaptive language: prefixes a lead-in that matches the confidence level so
 * users can feel the difference between "n=8, small effect" and "n=90, large
 * effect" without having to inspect the badge. `softenInsight()` still runs
 * over the result so any lingering causal wording gets neutralized.
 *
 * Preserves the original prefix if the text already opens with an obvious
 * hedge ("Tends to…", "Often…", "You may find that…") so we don't stack
 * qualifiers awkwardly.
 */
const HEDGE_PREFIXES: Record<Confidence, string> = {
  low:       'There may be a mild pattern: ',
  moderate:  'You often see that ',
  high:      'A consistent pattern shows ',
  very_high: 'Strongly: ',
};

const ALREADY_HEDGED = /^(tends to|often|you (may|often|tend)|there (may|tends|appears)|a (mild|consistent|strong) pattern|strongly[:,])/i;

export function adaptiveInsight(text: string | null | undefined, confidence: Confidence): string {
  if (!text) return '';
  const soft = softenInsight(text);
  if (ALREADY_HEDGED.test(soft)) return soft;
  const prefix = HEDGE_PREFIXES[confidence];
  // Lowercase the first char of the original so the prefix reads naturally
  // ("Strongly: your…" not "Strongly: Your…").
  const body = soft.charAt(0).toLowerCase() + soft.slice(1);
  return prefix + body;
}
