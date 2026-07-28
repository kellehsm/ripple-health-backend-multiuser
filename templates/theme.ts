// Ripple Wellness color system.
// Theme defines all surface tokens and metric color family slots.
// Family names (teal, coral, etc.) are semantic roles, not literal hues —
// each palette fills them with hues appropriate to its visual style.

export type ColorFamily = {
  bg: string;     // light background for chips/badges
  fg: string;     // text color on bg
  sub: string;    // secondary/darker tone
  bar?: string;   // bar/progress color (defaults to solid)
  solid: string;  // primary color
  tint: string;   // very light tint, often == bg
};

export type SparseFamily = {
  sub: string;
  solid: string;
  tint: string;
};

export type CycleColors = {
  period: string;       // period days
  predicted: string;    // predicted period
  mood: string;         // mood-day marker
  symptom: string;      // symptom marker
  fertile: string;      // fertile window
  ovulation: string;    // ovulation day
};

export type FinanceCategoryColors = {
  food: string;
  transport: string;
  shopping: string;
  health: string;
  entertainment: string;
  utilities: string;
  other: string;
};

export type Theme = {
  id: string;
  name: string;
  group: string;
  isDark: boolean;

  ink: string;          // borders, shadows, outlines
  cream: string;        // subtlest background
  page: string;         // main screen background
  gradientEnd: string;  // far end of per-screen background gradient
  card: string;         // card / surface
  cardBorder: string;   // card borders / dividers
  textStrong: string;  // headings, primary values
  textSoft: string;    // labels, captions, placeholders

  primary: string;      // main CTA, active switches/chips
  success: string;      // positive / in-range state
  warning: string;      // caution / elevated values
  danger: string;       // urgent alert
  glucoseHigh: string;  // hyperglycemia indicator
  glucoseLow: string;   // hypoglycemia indicator

  // Metric color families — semantic slots that vary by palette
  teal: ColorFamily & { bar: string };   // activity: steps, hobbies, books
  coral: ColorFamily;                    // food / meals
  blue: ColorFamily;                     // water
  amber: ColorFamily;                    // sleep
  purple: ColorFamily;                   // finance / spending
  berry: ColorFamily & { bar: string };  // glucose & heart rate (in-range)
  violet: ColorFamily;                   // mood
  red: ColorFamily;                      // danger / glucose alerts

  // Backward-compat aliases used by legacy code
  pink: ColorFamily & { bar?: string };
  green: ColorFamily;
  brown: SparseFamily;

  cycle:    CycleColors;
  finance:  FinanceCategoryColors;

  /** Optional per-theme string overrides. Keys from StringMap in src/strings/defaults.ts. */
  strings?: Partial<import("../strings/defaults").StringMap>;

  /** Per-theme icon overrides. Key = slot ID (e.g. "tab.wellness"), value = IconAsset from iconRegistry. */
  iconOverrides?: Record<string, import("./iconRegistry").IconAsset>;

  /** Per-theme font family override. Key must be a FontFamilyKey from fontSystem. Defaults to "System". */
  fontFamily?: import("./fontSystem").FontFamilyKey;

  /**
   * Per-element background image overrides.
   * Key = pageId, cardId, or tileId from pageTemplates.ts.
   * Value = ThemeableBackground — use { type: "image", value: require("...") }
   * or { type: "uri", value: "https://..." } for remote images.
   * Color overrides are also accepted: { type: "color", value: "#hexOrToken" }.
   */
  pageBackgrounds?: Record<string, import("./pageTemplates").ThemeableBackground>;
  cardBackgrounds?: Record<string, import("./pageTemplates").ThemeableBackground>;
  tileBackgrounds?: Record<string, import("./pageTemplates").ThemeableBackground>;
};
