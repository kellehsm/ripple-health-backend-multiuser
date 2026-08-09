/**
 * Reduce Motion accessibility hook.
 *
 * Returns true when the user has requested reduced motion at the OS level.
 * All non-essential animations (stagger, spring, parallax, ripple) MUST
 * fall back to instant or fade under this flag.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => {
      if (!cancelled) setReduced(!!v);
    }).catch(() => { /* older RN — assume no */ });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => setReduced(!!v));
    return () => { cancelled = true; sub?.remove?.(); };
  }, []);

  return reduced;
}
