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
