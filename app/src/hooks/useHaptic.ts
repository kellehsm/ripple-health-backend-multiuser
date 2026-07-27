import { useCallback, useRef, useEffect } from "react";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

type HapticStyle = "selection" | "light" | "medium" | "heavy" | "notification";

export function useHaptic() {
  const enabled = useRef(true);

  useEffect(() => {
    AsyncStorage.getItem("haptics_enabled").then((v) => {
      if (v === "false") enabled.current = false;
    });
  }, []);

  const trigger = useCallback((style: HapticStyle = "selection") => {
    if (!enabled.current) return;
    try {
      switch (style) {
        case "selection":
          Haptics.selectionAsync();
          break;
        case "light":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case "medium":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case "heavy":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case "notification":
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
      }
    } catch {}
  }, []);

  return trigger;
}
