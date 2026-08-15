import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { registerToastOverlay, type ToastAction } from "../lib/toast";

type ToastState = {
  msg: string;
  type: "success" | "error" | "info";
  action?: ToastAction;
};

// In-app toast pill rendered above the tab bar. Handles iOS toasts and any
// toast carrying an action button (native Android toasts can't have buttons).
export function ToastHost() {
  const { theme } = useTheme();
  const [state, setState] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    registerToastOverlay((msg, type, duration = 3000, action) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setState({ msg, type, action });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(dismiss, duration);
    });
    return () => {
      registerToastOverlay(null as any);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  function dismiss() {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setState(null);
    });
  }

  if (!state) return null;

  const border =
    state.type === "error" ? theme.danger : state.type === "info" ? theme.teal.solid : theme.success;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 16, right: 16, bottom: 96, opacity, alignItems: "center" }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: theme.card,
          borderColor: border,
          borderWidth: 2,
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 10,
          maxWidth: "100%",
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
        }}
      >
        <Text style={{ color: theme.textStrong, fontSize: 13, flexShrink: 1 }}>{state.msg}</Text>
        {state.action && (
          <Pressable
            onPress={() => {
              const a = state.action;
              dismiss();
              a?.onPress();
            }}
            hitSlop={10}
            accessibilityRole="button"
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: border }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>{state.action.label}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}
