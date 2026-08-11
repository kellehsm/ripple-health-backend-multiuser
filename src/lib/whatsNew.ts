// What's-new changelog. Bump `LATEST_VERSION` (matches app.json version) and
// add an entry here whenever you cut a build with user-visible changes. Users
// see the modal exactly once per version on first launch after the update.

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

export type ChangelogEntry = {
  version: string;
  headline: string;
  bullets: string[];
};

// Newest first. Only entries with a version <= the running app version show.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.3.0",
    headline: "Fresh watch tiles, smarter glucose",
    bullets: [
      "Watch Tiles preview — swipe the three Wear OS faces in Settings → Watch Tiles.",
      "New rising/falling glucose early-warning alert (opt-in under Notifications).",
      "Mindfulness streak now forgives one skipped day so a single miss doesn't reset weeks.",
      "Insights read fresher — the correlation cards rotate through three phrasings per tier.",
    ],
  },
];

const KEY = "ripple.whatsNew.lastShownVersion";

export function currentAppVersion(): string {
  return (Constants.expoConfig?.version ?? "0.0.0") as string;
}

export async function pendingChangelog(): Promise<ChangelogEntry | null> {
  const running = currentAppVersion();
  const lastShown = (await AsyncStorage.getItem(KEY)) ?? "";
  if (lastShown === running) return null;
  const entry = CHANGELOG.find((e) => e.version === running);
  if (!entry) {
    // No entry for this version — still record it so we don't ask again next launch.
    await AsyncStorage.setItem(KEY, running);
    return null;
  }
  return entry;
}

export async function markChangelogSeen(): Promise<void> {
  await AsyncStorage.setItem(KEY, currentAppVersion());
}
