// Shared time / entry formatters used across ExerciseScreen, ExerciseSessionScreen,
// ExerciseDetailScreen, and workout modals. Kept as pure functions so unit tests
// don't need any React context.

type EntryLike = {
  weight_used?: number | null;
  sets?: number | null;
  reps?: number | null;
  duration_seconds?: number | null;
  actual_reps_per_set?: number[] | null;
};

/** `M:SS` (no hours) or `H:MM:SS` — live timer style. */
export function formatSecs(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Human-friendly duration: "1h 5m" or "45 min". Used in history / summary. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

/** "3 × 10 reps @ 135 lbs" / "10/10/8 reps @ 135 lbs" / "30 min" etc. */
export function entryLabel(entry: EntryLike): string {
  const wt = entry.weight_used ? ` @ ${entry.weight_used} lbs` : '';
  if (entry.actual_reps_per_set && entry.actual_reps_per_set.length > 0) {
    const arr = entry.actual_reps_per_set;
    const allSame = arr.every((r) => r === arr[0]);
    if (allSame) return `${arr.length} × ${arr[0]} reps${wt}`;
    return `${arr.join('/')} reps${wt}`;
  }
  if (entry.sets && entry.reps) return `${entry.sets} × ${entry.reps} reps${wt}`;
  if (entry.sets) return `${entry.sets} set${entry.sets > 1 ? 's' : ''}${wt}`;
  if (entry.duration_seconds) {
    const m = Math.floor(entry.duration_seconds / 60);
    const s = entry.duration_seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return 'Logged';
}

/**
 * True if every set in `actual_reps_per_set` met or exceeded `target`.
 * Used to badge sessions where the user hit the top of their rep range.
 */
export function allSetsMaxed(entry: EntryLike, target?: number | null): boolean {
  if (!target || !entry.actual_reps_per_set?.length) return false;
  return entry.actual_reps_per_set.every((r) => r >= target);
}

/**
 * Suggest a next-time weight based on prior session performance.
 * Heuristic: if all sets maxed, +5lbs (upper body proxy) or +10lbs (compound proxy).
 * Returns null when there's no sensible suggestion.
 */
export function suggestNextWeight(
  entry: EntryLike & { primary_muscles?: string[] },
  targetRepMax?: number | null,
): number | null {
  if (!entry.weight_used || !allSetsMaxed(entry, targetRepMax)) return null;
  const compoundMuscles = ['quadriceps', 'hamstrings', 'glutes', 'back', 'chest'];
  const isCompound = (entry.primary_muscles ?? []).some((m) =>
    compoundMuscles.includes(m.toLowerCase()),
  );
  return entry.weight_used + (isCompound ? 10 : 5);
}
