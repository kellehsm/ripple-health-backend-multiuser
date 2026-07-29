import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  Dimensions,
  StyleSheet,
  ScrollView,
  Animated,
  PanResponder,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useCardBg } from "../theme/AppSettingsContext";

const { width: W, height: H } = Dimensions.get("window");
const SPOT_PAD = 10;
// Generous estimate: topRow + title + body(3 lines) + dots + button + padding = ~240px
const CARD_H_EST = 250;
// Scroll element close to the top so the tooltip card has maximum space below it
const SCROLL_TARGET_RATIO = 0.10;
// Needs to be > H*(1 - SCROLL_TARGET_RATIO) so even the last element can reach target.
// H*0.68 gives comfortable margin above the minimum of H*0.65.
export const TOUR_EXTRA_PADDING = Math.ceil(H * 0.68);

export type TourStep = {
  ref: React.RefObject<View | any>;
  title: string;
  body: string;
  borderRadius?: number;
};

type Spot = { x: number; y: number; w: number; h: number; r: number };

type Props = {
  steps: TourStep[];
  visible: boolean;
  onDone: () => void;
  scrollRef?: React.RefObject<ScrollView | any>;
  scrollY?: number;
  onExtraPadding?: (padding: number) => void;
};

export function FeatureTour({ steps, visible, onDone, scrollRef, scrollY, onExtraPadding }: Props) {
  const { theme } = useTheme();
  const cardBg = useCardBg();
  const [idx, setIdx] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const savedScrollY = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Change 1: Animated dot values (one per step, stable across renders) ──
  const dotAnims = useRef<Animated.Value[]>([]);
  if (dotAnims.current.length !== steps.length) {
    dotAnims.current = steps.map((_, i) => new Animated.Value(i === 0 ? 1 : 0));
  }

  useEffect(() => {
    if (!visible) return;
    const springs = dotAnims.current.map((anim, i) =>
      Animated.spring(anim, {
        toValue: i === idx ? 1 : 0,
        useNativeDriver: true,
        tension: 200,
        friction: 10,
      })
    );
    Animated.parallel(springs).start();
  }, [idx, visible]);

  // ── Change 2: Step fade+slide transition ──
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  const [displayIdx, setDisplayIdx] = useState(0);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (!visible) {
      setDisplayIdx(0);
      contentOpacity.setValue(1);
      contentTranslateY.setValue(0);
      isFirstMount.current = true;
      return;
    }
    if (isFirstMount.current) {
      isFirstMount.current = false;
      setDisplayIdx(idx);
      return;
    }
    // Fade out + slide up
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateY, {
        toValue: -8,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Swap content while invisible
      setDisplayIdx(idx);
      contentTranslateY.setValue(8);
      // Fade in + slide up to rest
      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [idx, visible]);

  // ── Change 3: Swipe-down PanResponder ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gs) => gs.dy > 10,
      onPanResponderRelease: (_evt, gs) => {
        if (gs.dy > 60) {
          // handleDone is defined below but captured via ref
          handleDoneRef.current();
        }
      },
    })
  ).current;
  const handleDoneRef = useRef<() => void>(() => {});

  // Cancel all pending timeouts on unmount to prevent state updates after unmount
  useEffect(() => () => { timeoutsRef.current.forEach(clearTimeout); }, []);

  const doMeasure = useCallback((step: TourStep) => {
    if (!step?.ref?.current) { setSpot(null); return; }
    step.ref.current.measure(
      (_x: number, _y: number, w: number, h: number, px: number, py: number) => {
        if (w > 0 && h > 0) {
          // ── Change 4: store borderRadius from step (or default 14) ──
          setSpot({
            x: px - SPOT_PAD,
            y: py - SPOT_PAD,
            w: w + SPOT_PAD * 2,
            h: h + SPOT_PAD * 2,
            r: step.borderRadius ?? 14,
          });
        } else {
          setSpot(null);
        }
      }
    );
  }, []);

  const measure = useCallback(() => {
    const step = steps[idx];
    if (!step?.ref?.current) { setSpot(null); return; }

    if (scrollRef?.current) {
      step.ref.current.measureLayout(
        scrollRef.current,
        (_lx: number, ly: number) => {
          // Scroll so element sits at ~38% from the top of the visible area,
          // leaving room below for the tooltip card
          const scrollTarget = Math.max(0, ly - Math.floor(H * SCROLL_TARGET_RATIO));
          scrollRef.current!.scrollTo({ y: scrollTarget, animated: true });
          // Wait for scroll animation to settle then measure window position
          timeoutsRef.current.push(setTimeout(() => doMeasure(step), 380));
        },
        // measureLayout failed (element not in this scroll view) — fall back
        () => { timeoutsRef.current.push(setTimeout(() => doMeasure(step), 150)); }
      );
    } else {
      timeoutsRef.current.push(setTimeout(() => doMeasure(step), 150));
    }
  }, [steps, idx, scrollRef, doMeasure]);

  useEffect(() => {
    if (!visible) {
      setIdx(0);
      setSpot(null);
      onExtraPadding?.(0);
      return;
    }
    // Expand scroll content so bottom elements can scroll into target position
    onExtraPadding?.(TOUR_EXTRA_PADDING);
    // Save scroll position once at tour start so we can restore on done
    if (idx === 0) savedScrollY.current = scrollY ?? 0;
    measure();
  }, [visible, idx, measure, scrollY, onExtraPadding]);

  function handleDone() {
    onExtraPadding?.(0);
    scrollRef?.current?.scrollTo({ y: savedScrollY.current, animated: true });
    onDone();
  }

  // Keep the ref in sync so the PanResponder closure always calls the current version
  handleDoneRef.current = handleDone;

  if (!visible) return null;

  const step = steps[idx];
  const displayStep = steps[displayIdx] ?? step;
  const isLast = idx === steps.length - 1;

  function next() {
    if (isLast) handleDone();
    else setIdx(i => i + 1);
  }

  // Position card: below spotlight if it fits, above if not, center as last resort.
  // Always clamp so card + button never clip off the bottom of the screen.
  let cardTop: number;
  if (spot) {
    const belowY  = spot.y + spot.h + 16;
    const belowFits = belowY + CARD_H_EST < H - 16;
    const aboveY  = spot.y - 16 - CARD_H_EST;
    const aboveFits = aboveY > 60;

    if (belowFits) {
      cardTop = belowY;
    } else if (aboveFits) {
      cardTop = aboveY;
    } else {
      // Neither fits cleanly — center the card on screen
      cardTop = H / 2 - CARD_H_EST / 2;
    }
  } else {
    cardTop = H / 2 - CARD_H_EST / 2;
  }
  // Final safety clamp: keep card fully visible
  cardTop = Math.max(16, Math.min(cardTop, H - CARD_H_EST - 32));

  const DIM = "rgba(0,0,0,0.72)";

  return (
    <Modal transparent visible animationType="fade" onRequestClose={handleDone} statusBarTranslucent>
      {/* Swipe-down-to-dismiss gesture wrapper (Change 3) */}
      <View style={StyleSheet.absoluteFill} {...panResponder.panHandlers} pointerEvents="box-none">
        {/* ── Dimmed overlay: 4 views frame the spotlight, full-dim if no spot ── */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {spot ? (
            <>
              {/* Change 4: use spot.r for corner clipping on all frame pieces */}
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: spot.y, backgroundColor: DIM }} />
              <View style={{ position: "absolute", top: spot.y + spot.h, left: 0, right: 0, bottom: 0, backgroundColor: DIM }} />
              <View style={{ position: "absolute", top: spot.y, left: 0, width: spot.x, height: spot.h, backgroundColor: DIM }} />
              <View style={{ position: "absolute", top: spot.y, left: spot.x + spot.w, right: 0, height: spot.h, backgroundColor: DIM }} />
              {/* Spotlight ring — Change 4: use spot.r */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: spot.y, left: spot.x, width: spot.w, height: spot.h,
                  borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: spot.r,
                }}
              />
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
          )}
        </View>

        {/* Tap backdrop to advance */}
        <Pressable style={StyleSheet.absoluteFill} onPress={next} />

        {/* ── Tooltip card ── */}
        <View
          style={[
            styles.card,
            { top: cardTop, borderColor: theme.cardBorder },
          ]}
        >
          {/* Header — distinct background fills the top section */}
          <View style={[styles.cardHeader, { backgroundColor: theme.teal.tint }]}>
            <View style={styles.topRow}>
              <Text style={[styles.counter, { color: theme.teal.fg }]}>
                {idx + 1} of {steps.length}
              </Text>
              <Pressable onPress={handleDone} hitSlop={12}>
                <Text style={[styles.skip, { color: theme.teal.fg }]}>Skip</Text>
              </Pressable>
            </View>
            {/* Change 2: animated title in header */}
            <Animated.Text
              style={[
                styles.title,
                { color: theme.teal.fg },
                { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] },
              ]}
            >
              {displayStep.title}
            </Animated.Text>
          </View>

          {/* Body — card background fills the bottom section */}
          <View style={[styles.cardBody, { backgroundColor: cardBg }]}>
            {/* Change 2: animated body text */}
            <Animated.Text
              style={[
                styles.body,
                { color: theme.textSoft },
                { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] },
              ]}
            >
              {displayStep.body}
            </Animated.Text>

            {/* Change 1: Animated progress dots */}
            <View style={styles.dots}>
              {steps.map((_, i) => {
                const anim = dotAnims.current[i];
                const scale = anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1.0, 1.4],
                });
                const opacity = anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1.0],
                });
                return (
                  <Animated.View
                    key={i}
                    style={[
                      styles.dot,
                      { backgroundColor: i === idx ? theme.teal.solid : theme.cardBorder },
                      { transform: [{ scale }], opacity },
                    ]}
                  />
                );
              })}
            </View>

            <Pressable onPress={next} style={[styles.btn, { backgroundColor: theme.teal.solid }]}>
              <Text style={styles.btnText}>{isLast ? "Got it" : "Next  →"}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    left: 20,
    right: 20,
    borderRadius: 22,
    borderWidth: 2,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 14,
  },
  cardHeader: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 14,
  },
  cardBody: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 18,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  counter: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  skip: { fontSize: 13, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "900" },
  body: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  dots: { flexDirection: "row", gap: 5, marginBottom: 14 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  btn: { borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
