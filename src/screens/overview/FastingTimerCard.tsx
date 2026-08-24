/**
 * overview/FastingTimerCard.tsx
 * Self-contained fasting timer card: owns its own state, focus effects,
 * and pulse animation. Extracted from OverviewScreen.tsx — no logic changes.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, Animated } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../../theme/ThemeContext";
import { getFastStatus, startFast, stopFast, formatElapsed, type FastStatus } from "../../lib/fastingTimer";
import { onSolid } from "../../theme/colorUtils";
import { FONT_SIZES } from "../../theme/tokens";

export function FastingTimerCard() {
  const { theme } = useTheme();
  const [fastingEnabled, setFastingEnabled] = useState(false);
  const [fastStatus, setFastStatus] = useState<FastStatus>({ active: false, startMs: null, elapsedMs: 0 });
  const fastPulseAnim = useRef(new Animated.Value(0.4)).current;
  const fastPulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Fasting timer — load on focus, tick every minute while active
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    AsyncStorage.getItem("fasting_timer_enabled").then((v) => { if (!cancelled) setFastingEnabled(v === "1"); }).catch(() => {});
    getFastStatus().then((s) => { if (!cancelled) setFastStatus(s); });
    const interval = setInterval(async () => {
      const s = await getFastStatus();
      if (!cancelled) setFastStatus(s);
    }, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []));

  // Fasting pulse ring — loop while fast is active
  useEffect(function () {
    if (fastPulseLoopRef.current) { fastPulseLoopRef.current.stop(); fastPulseLoopRef.current = null; }
    if (!fastStatus.active) { fastPulseAnim.setValue(0.4); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(fastPulseAnim, { toValue: 0.05, duration: 1000, useNativeDriver: true }),
        Animated.timing(fastPulseAnim, { toValue: 0.4,  duration: 1000, useNativeDriver: true }),
      ])
    );
    fastPulseLoopRef.current = loop;
    loop.start();
    return () => { loop.stop(); };
  }, [fastStatus.active]);

  async function handleToggleFast() {
    if (fastStatus.active) {
      await stopFast();
    } else {
      await startFast();
    }
    const s = await getFastStatus();
    setFastStatus(s);
  }

  const TARGET_MS = 16 * 3600_000;
  const R = 14;
  const { pct, CIRC } = useMemo(() => {
    const p = fastStatus.active ? Math.min(fastStatus.elapsedMs / TARGET_MS, 1) : 0;
    return { pct: p, CIRC: 2 * Math.PI * R };
  }, [fastStatus.active, fastStatus.elapsedMs]);

  if (!fastingEnabled) return null;

  return (
    <Pressable
      onPress={handleToggleFast}
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: fastStatus.active ? theme.teal.tint : theme.card,
        borderWidth: 2,
        borderColor: fastStatus.active ? theme.teal.solid : theme.cardBorder,
        borderRadius: 18,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
        overflow: "visible",
      }}
    >
      {/* Pulse ring — rendered first so it sits behind content */}
      {fastStatus.active && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -6,
            left: -6,
            right: -6,
            bottom: -6,
            borderRadius: 24,
            borderWidth: 2,
            borderColor: theme.amber.solid,
            opacity: fastPulseAnim,
          }}
        />
      )}
      {/* Fasting progress ring */}
      <View style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
        {fastStatus.active && (
          <Svg width={36} height={36} viewBox="0 0 36 36" style={{ position: "absolute" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Circle cx="18" cy="18" r={R} stroke={theme.cardBorder} strokeWidth="3" fill="none" />
            <Circle
              cx="18" cy="18" r={R}
              stroke={theme.teal.solid}
              strokeWidth="3"
              fill="none"
              strokeDasharray={`${CIRC}`}
              strokeDashoffset={`${CIRC * (1 - pct)}`}
              strokeLinecap="round"
              rotation="-90"
              origin="18, 18"
            />
          </Svg>
        )}
        <Text style={{ fontSize: 18 }}>⏱️</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: fastStatus.active ? theme.teal.fg : theme.textStrong, fontWeight: "800", fontSize: FONT_SIZES.body }}>
          {fastStatus.active ? "Fasting · " + formatElapsed(fastStatus.elapsedMs) : "Start a Fast"}
        </Text>
        {fastStatus.active ? (
          <Text style={{ color: theme.teal.sub, fontSize: FONT_SIZES.caption, marginTop: 1 }}>Tap to end fast</Text>
        ) : (
          <Text style={{ color: theme.textSoft, fontSize: FONT_SIZES.caption, marginTop: 1 }}>Notifications at 12h, 16h, 24h</Text>
        )}
      </View>
      <View style={{
        backgroundColor: fastStatus.active ? theme.teal.solid : theme.teal.tint,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}>
        <Text style={{ color: fastStatus.active ? onSolid(theme.teal.solid) : theme.teal.fg, fontWeight: "800", fontSize: FONT_SIZES.caption }}>
          {fastStatus.active ? "STOP" : "START"}
        </Text>
      </View>
    </Pressable>
  );
}
