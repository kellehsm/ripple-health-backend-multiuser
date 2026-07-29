import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { AppLogo } from "./AppLogo";
import { useTheme } from "../theme/ThemeContext";

function RippleLoader({ color }: { color: string }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    function pulse(anim: Animated.Value, delay: number) {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 1600, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    }
    const anim = Animated.parallel([pulse(ring1, 0), pulse(ring2, 520), pulse(ring3, 1040)]);
    anim.start();
    return () => anim.stop();
  }, []);

  function ringStyle(anim: Animated.Value, size: number) {
    return {
      position: "absolute" as const,
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: 1.5,
      borderColor: color,
      opacity: anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.5, 0] }),
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.6] }) }],
    };
  }

  return (
    <View style={styles.rippleWrap}>
      <Animated.View style={ringStyle(ring1, 160)} />
      <Animated.View style={ringStyle(ring2, 160)} />
      <Animated.View style={ringStyle(ring3, 160)} />
      <AppLogo size={80} />
    </View>
  );
}

function PulseLoader({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.08, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <AppLogo size={80} />
    </Animated.View>
  );
}

export function LoadingScreen() {
  const { theme, loadingVariant } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.page }]}>
      {loadingVariant === "pulse"
        ? <PulseLoader color={theme.teal.bar} />
        : <RippleLoader color={theme.teal.bar} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  rippleWrap: { alignItems: "center", justifyContent: "center", width: 160, height: 160 },
});
