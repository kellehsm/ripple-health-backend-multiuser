import React, { useEffect, useRef } from "react";
import { Animated, Text, View, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  message: string;
  onDismiss: () => void;
}

export function StaleSyncBanner({ message, onDismiss }: Props) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(80)).current;

  useEffect(function () {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  function dismiss() {
    Animated.timing(translateY, {
      toValue: 120,
      duration: 220,
      useNativeDriver: true,
    }).start(onDismiss);
  }

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          bottom: insets.bottom + 72,
          backgroundColor: theme.amber.tint,
          borderColor: theme.amber.solid,
          transform: [{ translateY }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={18} color={theme.amber.fg} style={{ marginRight: 10, flexShrink: 0 }} />
      <Text style={[styles.text, { color: theme.amber.fg, flex: 1 }]}>{message}</Text>
      <Pressable onPress={dismiss} hitSlop={12} style={{ marginLeft: 8 }}>
        <Ionicons name="close" size={16} color={theme.amber.fg} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 0,
    elevation: 4,
  },
  text: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
});
