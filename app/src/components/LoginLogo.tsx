import React, { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Path, G, Rect, Defs, ClipPath } from "react-native-svg";
import ReanimatedLib, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing as REasing,
} from "react-native-reanimated";

const AnimatedPolyline = ReanimatedLib.createAnimatedComponent(
  require("react-native-svg").Polyline
);

const TEAL   = "#149D74";
const CORAL  = "#E8654E";
const PURPLE = "#7E5A9B";
const BERRY  = "#A62A50";

const DROP_PATH =
  "M12 2.5 C11.5 2.5 4.5 10 4.5 15.5 C4.5 19.6 7.9 23 12 23 C16.1 23 19.5 19.6 19.5 15.5 C19.5 10 12.5 2.5 12 2.5Z";

const HB_POINTS = "0,12 7.5,12 8.1,11 9.2,13 10,12 10.5,12 11.2,8 12.8,16 13.5,12 24,12";
const HB_LENGTH = 58;

const HB_DRAW  = 1200;
const HB_PAUSE =  600;

const HB_STROKE      = 0.35;
const OUTLINE_STROKE = 0.45;

const DIM = 90;
const CONTAINER = Math.round(DIM * 2.4) + 8;

// Ring animation timing — matches heartbeat cycle (HB_DRAW + HB_PAUSE = 1800ms)
const LOOP_MS  = 1800;
const RING_DUR = 1200;
const RING_GAP =  250;

const RING_COLORS = [TEAL, CORAL, PURPLE];

export function LoginLogo() {
  const uid = useRef(Math.random().toString(36).slice(2, 6)).current;
  const clipId = `ll-${uid}`;

  // Heartbeat
  const dashOffset = useSharedValue(HB_LENGTH);
  const animatedHBProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
  }));

  // Ripple rings (same expanding-fade pattern as RippleLoader large)
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    dashOffset.value = withRepeat(
      withSequence(
        withTiming(0,         { duration: HB_DRAW,  easing: REasing.inOut(REasing.ease) }),
        withTiming(HB_LENGTH, { duration: 0 }),
        withTiming(HB_LENGTH, { duration: HB_PAUSE }),
      ),
      -1,
      false
    );

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

    return () => {
      cancelAnimation(dashOffset);
      ring1.stopAnimation();
      ring2.stopAnimation();
      ring3.stopAnimation();
    };
  }, []);

  return (
    <View
      style={{ width: CONTAINER, height: CONTAINER, alignItems: "center", justifyContent: "center" }}
      accessibilityLabel="Ripple Wellness"
      accessibilityRole="image"
    >
      {/* Animated ripple rings */}
      {[ring1, ring2, ring3].map((anim, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: DIM,
            height: DIM,
            borderRadius: DIM / 2,
            borderWidth: 2,
            borderColor: RING_COLORS[i],
            opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
          }}
        />
      ))}

      {/* Droplet */}
      <Svg width={DIM} height={DIM} viewBox="0 0 24 24">
        <Defs>
          <ClipPath id={clipId}>
            <Path d={DROP_PATH} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${clipId})`}>
          <Rect x="0"  y="0"  width="12" height="12" fill={TEAL}   />
          <Rect x="12" y="0"  width="12" height="12" fill={CORAL}  />
          <Rect x="0"  y="12" width="12" height="12" fill={PURPLE} />
          <Rect x="12" y="12" width="12" height="12" fill={BERRY}  />
        </G>
        <G clipPath={`url(#${clipId})`}>
          <AnimatedPolyline
            points={HB_POINTS}
            stroke="#111111"
            strokeWidth={HB_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={HB_LENGTH}
            animatedProps={animatedHBProps}
          />
        </G>
        <Path d={DROP_PATH} fill="none" stroke="#111111" strokeWidth={OUTLINE_STROKE} />
      </Svg>
    </View>
  );
}
