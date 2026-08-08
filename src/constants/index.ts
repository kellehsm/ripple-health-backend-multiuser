// ─── Shared App Constants ─────────────────────────────────────────────────────
// Constants that are either used in multiple screens or are clearly reusable.

import type { SectionDef } from "../components/SectionEditorModal";

// ─── Mood / time-of-day buckets ───────────────────────────────────────────────

export type MoodBucket = "morning" | "afternoon" | "evening" | "night";

/** Ordered array of time-of-day buckets for mood and overview display. */
export const BUCKET_ORDER: MoodBucket[] = ["morning", "afternoon", "evening", "night"];

/** Human-readable label for each mood bucket. */
export const BUCKET_LABEL: Record<MoodBucket, string> = {
  morning:   "Morning",
  afternoon: "Afternoon",
  evening:   "Evening",
  night:     "Night",
};

// ─── Cycle tracking ───────────────────────────────────────────────────────────

/** Ordered intensity options for flow logging. */
export const FLOW_OPTIONS: string[] = ["none", "spotting", "light", "medium", "heavy"];

/**
 * Wellness-palette background color per flow intensity.
 * "none" is transparent (no period / no flow).
 */
export const FLOW_COLORS: Record<string, string> = {
  none:     "transparent",
  spotting: "#EDD5C8",
  light:    "#F5C4B3",
  medium:   "#E8A89A",
  heavy:    "#C48070",
};

// ─── Meals ────────────────────────────────────────────────────────────────────

/**
 * Sections shown in the MealsScreen SectionEditorModal.
 * SectionDef is imported from SectionEditorModal.
 */
export const MEALS_SECTIONS: SectionDef[] = [
  { id: "your_usual", label: "Your Usual",  description: "Quick-add from saved meals and recipes" },
  { id: "booze",      label: "Alcohol",     description: "Alcohol logging section" },
];
