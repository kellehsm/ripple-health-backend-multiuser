import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_PREFIX = "ripple:featureIntro:";
const seenKey = (feature: string) => `${KEY_PREFIX}${feature}:seen`;

/**
 * Auto-shows a feature intro sheet the first time a screen mounts.
 * Returns `[visible, dismiss, forceOpen]`:
 *   - visible: true when the sheet should render
 *   - dismiss: marks the feature as seen and hides the sheet
 *   - forceOpen: shows the sheet again (used by the Feature Guide in Settings)
 */
export function useFeatureIntro(feature: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(seenKey(feature)).then((val) => {
      if (!cancelled && val !== "true") setVisible(true);
    });
    return () => { cancelled = true; };
  }, [feature]);

  const dismiss = useCallback(() => {
    setVisible(false);
    void AsyncStorage.setItem(seenKey(feature), "true");
  }, [feature]);

  const forceOpen = useCallback(() => setVisible(true), []);

  return [visible, dismiss, forceOpen] as const;
}

/** Reset the seen-flag for a feature (used by "Show me again" in Settings). */
export async function resetFeatureIntro(feature: string): Promise<void> {
  await AsyncStorage.removeItem(seenKey(feature));
}

/** Reset every feature so all intros re-appear on next visit. */
export async function resetAllFeatureIntros(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const toDelete = keys.filter((k) => k.startsWith(KEY_PREFIX));
  if (toDelete.length > 0) await AsyncStorage.multiRemove(toDelete);
}
