import { Platform } from "react-native";

/**
 * Nudges the Android widget provider to refetch metrics and mirror them to a
 * paired Wear OS watch. Safe no-op on iOS/web/Expo Go (module absent).
 */
export function syncWidgetAndWatch(): void {
  if (Platform.OS !== "android") return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require("expo-modules-core");
    requireNativeModule("RippleWidgetSync").syncNow();
  } catch {
    // native module not present in this runtime — ignore
  }
}
