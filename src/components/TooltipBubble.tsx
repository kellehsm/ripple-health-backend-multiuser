import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface TooltipBubbleProps {
  message: string;
  onDismiss: () => void;
}

export function TooltipBubble({ message, onDismiss }: TooltipBubbleProps) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 350, delay: 500, useNativeDriver: true }).start();
  }, [opacity]);

  function dismiss() {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(onDismiss);
  }

  return (
    <Animated.View
      style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.ink, opacity }]}
    >
      {/* Arrow pointing up */}
      <View style={[styles.arrow, { borderBottomColor: theme.ink }]} />
      <View style={[styles.arrowInner, { borderBottomColor: theme.card }]} />
      <View style={styles.row}>
        <Text style={[styles.message, { color: theme.textStrong }]}>{message}</Text>
        <Pressable onPress={dismiss} style={styles.dismissBtn} accessibilityRole="button" accessibilityLabel="Dismiss tip">
          <Text style={[styles.dismissText, { color: theme.textSoft }]}>Got it</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 0,
    elevation: 3,
  },
  arrow: {
    position: "absolute",
    top: -9,
    left: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 9,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  arrowInner: {
    position: "absolute",
    top: -6,
    left: 26,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  message: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  dismissBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  dismissText: {
    fontSize: 12,
    fontWeight: "700",
  },
});
