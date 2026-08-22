/**
 * CountUpText — reusable animated number count-up.
 *
 * Animates from 0 (or a `from` value) to `value` on mount/value-change.
 * Falls back to a static display when the OS reduce-motion flag is set.
 *
 * Usage:
 *   <CountUpText value={score} style={styles.scoreText} duration={400} />
 *   <CountUpText value={amount} format={(v) => "$" + v.toFixed(2)} style={s.dollar} />
 */
import React, { useEffect, useRef, useState } from "react";
import { Text, TextProps, Animated } from "react-native";
import { useReduceMotion } from "../hooks/useReduceMotion";

type Props = TextProps & {
  /** Numeric value to count up to. Non-finite or null/undefined → renders `fallback`. */
  value: number | null | undefined;
  /** Starting value (default: 0). */
  from?: number;
  /** Animation duration in ms (default: 350). */
  duration?: number;
  /** Custom formatter applied to the animated integer. Defaults to `Math.round(v).toString()`. */
  format?: (v: number) => string;
  /** Rendered when value is null/undefined or non-finite (default: "--"). */
  fallback?: string;
};

export function CountUpText({
  value,
  from = 0,
  duration = 350,
  format,
  fallback = "--",
  ...textProps
}: Props) {
  const reduceMotion = useReduceMotion();
  const animRef = useRef(new Animated.Value(from));
  const [display, setDisplay] = useState<string>(() => {
    if (value == null || !isFinite(value)) return fallback;
    return format ? format(from) : String(Math.round(from));
  });
  const doneRef = useRef(false);

  useEffect(() => {
    if (value == null || !isFinite(value)) {
      setDisplay(fallback);
      return;
    }

    // Skip animation when reduce-motion is on — jump straight to final value.
    if (reduceMotion) {
      setDisplay(format ? format(value) : String(Math.round(value)));
      return;
    }

    doneRef.current = false;
    animRef.current.setValue(from);

    const id = animRef.current.addListener(({ value: v }) => {
      if (!doneRef.current) {
        setDisplay(format ? format(v) : String(Math.round(v)));
      }
    });

    Animated.timing(animRef.current, {
      toValue: value,
      duration,
      useNativeDriver: false, // must be false — drives a JS state update
    }).start(() => {
      doneRef.current = true;
      animRef.current.removeListener(id);
      // Snap to exact formatted value so rounding artifacts disappear.
      setDisplay(format ? format(value) : String(Math.round(value)));
    });

    return () => {
      animRef.current.removeListener(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduceMotion]);

  return <Text {...textProps}>{display}</Text>;
}
