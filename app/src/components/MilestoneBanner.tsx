import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";

interface MilestoneBannerProps {
  message: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

export function MilestoneBanner({ message, onDismiss }: MilestoneBannerProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 9 }),
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: 80, duration: 400, useNativeDriver: true }),
      ]).start(() => onDismiss());
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [opacity, slideY, onDismiss]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: insets.bottom + 72,
          backgroundColor: theme.teal.solid,
          borderColor: theme.ink,
          opacity,
          transform: [{ translateY: slideY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <Pressable onPress={onDismiss} style={styles.inner}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={[styles.text, { color: "#fff" }]}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 26,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 6,
    zIndex: 9000,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  emoji: {
    fontSize: 20,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
});
