import React, { useEffect, useRef } from "react";
import { Animated, Easing, View, StyleProp, ViewStyle } from "react-native";
import Svg, { Path, G, Rect, Defs, ClipPath, Polyline } from "react-native-svg";
import ReanimatedLib, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing as REasing,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";
import { useReduceMotion } from "../hooks/useReduceMotion";

const AnimatedPolyline = ReanimatedLib.createAnimatedComponent(Polyline);

// Droplet outline path in a 24×24 viewBox
const DROP_PATH =
  "M12 2.5 C11.5 2.5 4.5 10 4.5 15.5 C4.5 19.6 7.9 23 12 23 C16.1 23 19.5 19.6 19.5 15.5 C19.5 10 12.5 2.5 12 2.5Z";

// EKG/heartbeat polyline at y=12 (vertical midpoint). Clipped to droplet shape.
const HB_POINTS = "0,12 7.5,12 8.1,10.8 9.2,13.2 10,12 10.5,12 11.2,7.5 12.8,16.5 13.5,12 24,12";
// Approximate total polyline length (for stroke-dasharray)
const HB_LENGTH = 58;

// Loop timing constants (all in ms)
const LOOP_MS   = 1000;  // full cycle
const RING_DUR  = 700;
const RING_GAP  = 130;   // stagger between rings
const HB_DRAW   = 600;   // heartbeat draw duration
const HB_PAUSE  = 250;   // pause before reset (fits within LOOP_MS)

export type RippleLoaderSize = "small" | "large" | "splash";

interface Props {
  size?: RippleLoaderSize;
  style?: StyleProp<ViewStyle>;
}

export function RippleLoader({ size = "large", style }: Props) {
  const { theme } = useTheme();
  const TEAL   = theme.teal.solid;
  const CORAL  = theme.coral.solid;
  const PURPLE = theme.purple.solid;
  const BERRY  = theme.berry.solid;
  const INK    = theme.ink;

  const isSmall = size === "small";
  const isSplash = size === "splash";
  const dim = isSmall ? 22 : isSplash ? 120 : 52;

  // Container size: rings only for "large"
  const containerDim = (isSmall || isSplash) ? dim : Math.round(dim * 2.4);
  const ringSize = dim;

  // Stroke widths in viewBox coords — splash renders at 5× scale so needs proportionally thinner lines
  const hbStrokeWidth = isSplash ? 0.5 : 1.2;
  const outlineStrokeWidth = isSplash ? 0.45 : 1.0;

  const uid = useRef(Math.random().toString(36).slice(2, 6)).current;
  const clipId = `rl-${uid}`;

  // ── Breathing scale (Animated API, native driver) ────────────────────────
  const scale = useRef(new Animated.Value(1)).current;

  // ── Ring animations (Animated API, native driver) ────────────────────────
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  // ── Heartbeat stroke-dashoffset (Reanimated, for SVG prop) ───────────────
  const dashOffset = useSharedValue(HB_LENGTH);

  const animatedHBProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  const reduceMotion = useReduceMotion();
  useEffect(() => {
    // Respect the OS Reduce Motion setting — with it on, we show a static
    // loader (the size + shape still communicate "loading" without motion).
    if (reduceMotion) return;
    // Breathing scale: active for small and large; splash is static (line is the animation)
    if (!isSplash) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.07, duration: 280, useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(scale, {
            toValue: 0.94, duration: 260, useNativeDriver: true,
            easing: Easing.inOut(Easing.ease),
          }),
          Animated.timing(scale, {
            toValue: 1, duration: 180, useNativeDriver: true,
          }),
          Animated.delay(LOOP_MS - 280 - 260 - 180),
        ])
      ).start();
    }

    if (!isSmall && !isSplash) {
      // Ring helper: animate a ring from scale 1→2.4, opacity 0.5→0, with stagger
      const ringAnim = (anim: Animated.Value, delayMs: number) => {
        Animated.loop(
          Animated.sequence([
            Animated.delay(delayMs),
            Animated.timing(anim, {
              toValue: 1, duration: RING_DUR, useNativeDriver: true,
              easing: Easing.out(Easing.quad),
            }),
            Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
            Animated.delay(LOOP_MS - RING_DUR - delayMs),
          ])
        ).start();
      };
      ringAnim(ring1, 0);
      ringAnim(ring2, RING_GAP);
      ringAnim(ring3, RING_GAP * 2);
    }

    // Heartbeat: draw from left to right, pause, reset, repeat
    dashOffset.value = withRepeat(
      withSequence(
        withTiming(0, { duration: HB_DRAW, easing: REasing.inOut(REasing.ease) }),
        withTiming(HB_LENGTH, { duration: 0 }),
        withTiming(HB_LENGTH, { duration: HB_PAUSE }), // pause before next cycle
      ),
      -1,
      false
    );

    return () => {
      scale.stopAnimation();
      if (!isSmall && !isSplash) {
        ring1.stopAnimation();
        ring2.stopAnimation();
        ring3.stopAnimation();
      }
      cancelAnimation(dashOffset);
    };
  }, [isSmall, isSplash]);

  // Interpolated ring styles
  function ringView(anim: Animated.Value, color: string) {
    return (
      <Animated.View
        key={color}
        style={{
          position: "absolute",
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth: 2,
          borderColor: color,
          opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
        }}
      />
    );
  }

  const droplet = (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Svg width={dim} height={dim} viewBox="0 0 24 24">
        <Defs>
          <ClipPath id={clipId}>
            <Path d={DROP_PATH} />
          </ClipPath>
        </Defs>
        {/* Four-quadrant fill, clipped to droplet outline */}
        <G clipPath={`url(#${clipId})`}>
          <Rect x="0"  y="0"  width="12" height="12" fill={TEAL}   />
          <Rect x="12" y="0"  width="12" height="12" fill={CORAL}  />
          <Rect x="0"  y="12" width="12" height="12" fill={PURPLE} />
          <Rect x="12" y="12" width="12" height="12" fill={BERRY}  />
        </G>
        {/* Heartbeat line, clipped to droplet */}
        <G clipPath={`url(#${clipId})`}>
          <AnimatedPolyline
            points={HB_POINTS}
            stroke={INK}
            strokeWidth={hbStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={HB_LENGTH}
            animatedProps={animatedHBProps}
          />
        </G>
        {/* Outline on top */}
        <Path d={DROP_PATH} fill="none" stroke={INK} strokeWidth={outlineStrokeWidth} />
      </Svg>
    </Animated.View>
  );

  if (isSmall || isSplash) {
    return (
      <View
        style={[{ width: dim, height: dim, alignItems: "center", justifyContent: "center" }, style]}
        accessibilityLabel="Loading"
        accessibilityRole="progressbar"
      >
        {droplet}
      </View>
    );
  }

  return (
    <View
      style={[{ width: containerDim, height: containerDim, alignItems: "center", justifyContent: "center" }, style]}
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
    >
      {ringView(ring1, TEAL)}
      {ringView(ring2, CORAL)}
      {ringView(ring3, PURPLE)}
      {droplet}
    </View>
  );
}
