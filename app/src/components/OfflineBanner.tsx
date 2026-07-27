import React, { useEffect, useRef, useState } from "react";
import { Animated, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getNetworkState, subscribeNetwork } from "../utils/networkState";
import { useTheme } from "../theme/ThemeContext";

type BannerMode = "offline" | "pending" | "synced" | "hidden";

function computeMode(online: boolean, pending: number): BannerMode {
  if (!online) return "offline";
  if (pending > 0) return "pending";
  return "hidden";
}

export function OfflineBanner() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const initial = getNetworkState();
  const [mode, setMode] = useState<BannerMode>(computeMode(initial.online, initial.pending));
  const slideY = useRef(new Animated.Value(mode === "hidden" ? -60 : 0)).current;
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeNetwork((online, pending) => {
      setMode(prev => {
        const next = computeMode(online, pending);
        if (next === "hidden" && (prev === "pending" || prev === "offline")) {
          // Briefly flash "synced" before hiding
          if (clearTimer.current) clearTimeout(clearTimer.current);
          clearTimer.current = setTimeout(() => setMode("hidden"), 1800);
          return "synced";
        }
        return next;
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const visible = mode !== "hidden";

  useEffect(() => {
    Animated.spring(slideY, {
      toValue: visible ? 0 : -60,
      useNativeDriver: true,
      tension: 80,
      friction: 10,
    }).start();
  }, [visible, slideY]);

  const bg =
    mode === "offline"
      ? theme.amber?.solid ?? "#D97706"
      : mode === "pending"
      ? theme.teal.solid
      : theme.success ?? "#16A34A";

  const label =
    mode === "offline"
      ? "Offline — changes will sync when connected"
      : mode === "pending"
      ? "Syncing offline changes…"
      : "All caught up";

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingTop: insets.top + 8, backgroundColor: bg, transform: [{ translateY: slideY }] },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: 10,
    alignItems: "center",
  },
  text: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
