import { useRef, useCallback } from "react";
import { Animated } from "react-native";

type Preset = "chip" | "card" | "button";

const CONFIG: Record<Preset, { scaleIn: number; speedIn: number; speedOut: number; bounceOut: number }> = {
  chip:   { scaleIn: 0.96, speedIn: 50,  speedOut: 50,  bounceOut: 4 },
  card:   { scaleIn: 0.98, speedIn: 300, speedOut: 300, bounceOut: 4 },
  button: { scaleIn: 0.94, speedIn: 60,  speedOut: 40,  bounceOut: 6 },
};

export function usePressScale(preset: Preset = "chip") {
  const scale = useRef(new Animated.Value(1)).current;
  const cfg = CONFIG[preset];

  const onPressIn = useCallback(() => {
    Animated.spring(scale, { toValue: cfg.scaleIn, useNativeDriver: true, speed: cfg.speedIn, bounciness: 0 }).start();
  }, [scale, cfg.scaleIn, cfg.speedIn]);

  const onPressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: cfg.speedOut, bounciness: cfg.bounceOut }).start();
  }, [scale, cfg.speedOut, cfg.bounceOut]);

  return { scale, onPressIn, onPressOut };
}
