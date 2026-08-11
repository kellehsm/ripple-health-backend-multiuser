import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * Returns the OS "Reduce Motion" accessibility state and keeps it live via
 * AccessibilityInfo's change listener. Use to short-circuit non-essential
 * animations (shimmer, pulses, springs) — pair with a static fallback so the
 * UI still communicates its state.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { if (!cancelled) setReduce(v); })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => { cancelled = true; sub.remove(); };
  }, []);

  return reduce;
}
