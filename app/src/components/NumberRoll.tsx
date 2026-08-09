/**
 * Animated number counter — rolls from previous value to new value.
 *
 * Uses Animated.Value + interpolation via listener; falls back to a static
 * render when Reduce Motion is on.
 *
 * The count-up on first mount is a huge perceived-quality win at zero cost.
 */

import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, TextStyle } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { MOTION } from "../theme/motion";
import { formatNumber } from "../utils/format";

interface Props {
  value: number;
  digits?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  style?: TextStyle;
}

export function NumberRoll({ value, digits = 0, duration = MOTION.emphasis, prefix = "", suffix = "", style }: Props) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;
  const [displayed, setDisplayed] = useState(reduced ? value : 0);
  const prev = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) { setDisplayed(value); prev.current = value; return; }
    anim.setValue(0);
    const listener = anim.addListener(({ value: t }) => {
      setDisplayed(prev.current + (value - prev.current) * t);
    });
    Animated.timing(anim, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => { prev.current = value; });
    return () => anim.removeListener(listener);
  }, [value, duration, reduced, anim]);

  return <Text style={style}>{prefix}{formatNumber(displayed, digits)}{suffix}</Text>;
}
