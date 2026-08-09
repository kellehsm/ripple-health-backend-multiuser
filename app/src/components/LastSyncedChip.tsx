/**
 * Small "last synced 3 min ago" pill that any screen can drop into its
 * header — reassures the user that cached data isn't ancient.
 *
 * Persistence is by-screen: pass a stable `screenKey` and each screen
 * remembers its own timestamp.
 */

import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeContext";
import { ScaledText } from "./ScaledText";
import { IconVariant } from "./IconVariant";
import { formatRelativeTime } from "../utils/format";

const K = (screen: string) => `ripple_last_synced_${screen}`;

interface Props {
  screenKey: string;
  triggerAt?: number;   // change this number to bump "just now"
}

export function LastSyncedChip({ screenKey, triggerAt }: Props) {
  const { theme } = useTheme();
  const [when, setWhen] = useState<string | null>(null);

  const load = useCallback(async () => {
    const v = await AsyncStorage.getItem(K(screenKey)).catch(() => null);
    if (v) setWhen(v);
  }, [screenKey]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (triggerAt) {
      const now = new Date().toISOString();
      AsyncStorage.setItem(K(screenKey), now).catch(() => {});
      setWhen(now);
    }
  }, [triggerAt, screenKey]);

  // re-render label every 60s so "3 min ago" ticks
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  if (!when) return null;
  return (
    <View style={[styles.chip, { borderColor: theme.cardBorder ?? theme.ink + "22" }]}>
      <IconVariant name="check" size={11} state="muted" />
      <ScaledText size={10} color={theme.textSoft}>Synced {formatRelativeTime(when)}</ScaledText>
    </View>
  );
}

/** Programmatic bump — call this after a successful API load in any screen. */
export async function markSynced(screenKey: string) {
  await AsyncStorage.setItem(K(screenKey), new Date().toISOString()).catch(() => {});
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
  },
});
