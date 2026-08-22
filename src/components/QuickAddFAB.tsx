import React, { useRef, useState } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../theme/ThemeContext";
import { RADIUS, SPACING } from "../theme/tokens";
import { SPRING_BOUNCY } from "../theme/motion";

interface Action {
  label: string;
  emoji: string;
  onPress: () => void;
}

interface QuickAddFABProps {
  actions: Action[];
}

export function QuickAddFAB({ actions }: QuickAddFABProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toValue = open ? 0 : 1;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    Animated.spring(anim, { toValue, useNativeDriver: true, ...SPRING_BOUNCY }).start();
    setOpen(!open);
  };

  const close = () => {
    Animated.spring(anim, { toValue: 0, useNativeDriver: true, ...SPRING_BOUNCY }).start();
    setOpen(false);
  };

  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Backdrop */}
      {open && (
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      )}

      {/* Action items */}
      {actions.map((action, i) => {
        const translateY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -(i + 1) * 64],
        });
        const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });
        return (
          <Animated.View
            key={action.label}
            style={[styles.actionItem, { opacity, transform: [{ translateY }] }]}
          >
            <Text style={[styles.actionLabel, { color: theme.textStrong, backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              {action.label}
            </Text>
            <Pressable
              onPress={() => { close(); action.onPress(); }}
              style={[styles.actionBtn, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}
            >
              <Text style={styles.actionEmoji}>{action.emoji}</Text>
            </Pressable>
          </Animated.View>
        );
      })}

      {/* Main FAB */}
      <Pressable
        onPress={toggle}
        style={[styles.fab, { backgroundColor: theme.primary }]}
      >
        <Animated.Text style={[styles.fabIcon, { transform: [{ rotate }] }]}>+</Animated.Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { position: "absolute", bottom: SPACING.xl, right: SPACING.lg, alignItems: "flex-end" },
  fab:         { width: 56, height: 56, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", elevation: 6, shadowColor: "rgba(60,40,20,0.1)", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  fabIcon:     { fontSize: 28, color: "#fff", fontWeight: "300", lineHeight: 32, marginTop: -1 },
  actionItem:  { position: "absolute", bottom: 0, right: 0, flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  actionBtn:   { width: 48, height: 48, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", borderWidth: 1.5, elevation: 4 },
  actionEmoji: { fontSize: 20 },
  actionLabel: { fontSize: 13, fontWeight: "600", paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm, borderWidth: 1 },
});
