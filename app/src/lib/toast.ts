import { Platform, ToastAndroid } from "react-native";

// Cross-platform imperative toast.
// Android: native ToastAndroid. iOS: falls back to a registered overlay (see ToastOverlay).

type ToastType = "success" | "error" | "info";

let _overlay: ((msg: string, type: ToastType, duration?: number) => void) | null = null;

export function registerToastOverlay(fn: typeof _overlay) {
  _overlay = fn;
}

export function toast(message: string, type: ToastType = "success", durationMs = 3000) {
  if (Platform.OS === "android") {
    const dur = durationMs > 2500 ? ToastAndroid.LONG : ToastAndroid.SHORT;
    ToastAndroid.show(message, dur);
    return;
  }
  _overlay?.(message, type, durationMs);
}

// Friendly, categorized error messages for common failure scenarios
export const Msg = {
  networkError: "Couldn't reach your Ripple server. Check your connection and try again.",
  authError: "Your session has expired. Please sign in again.",
  syncDexcom: "Glucose data couldn't sync right now. Your previous readings are still available.",
  saveMeal: "Your meal wasn't saved. Try again — nothing was lost.",
  loadMeals: "Couldn't load today's meals. Pull down to retry.",
  logWater: "Water wasn't logged. Try again.",
  logMood: "Check-in wasn't saved. Try again.",
  logPages: "Reading progress wasn't saved. Try again.",
  logHobby: "Hobby session wasn't saved. Try again.",
  addSpending: "Expense wasn't saved. Try again.",
  loadData: "Couldn't load your data. Pull down to retry.",
  loadInsights: "Couldn't load insights — pull to retry.",
  saveSettings: "Settings couldn't be saved. Try again.",
  dismissInsight: "Couldn't dismiss that insight right now.",
  generic: "Something went wrong. Please try again.",
} as const;
