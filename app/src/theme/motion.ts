/**
 * Motion design system.
 *
 * WHY: Consistent motion is the single biggest cue that separates a
 * "premium" feel from a "generic RN" feel. All animations across the app
 * should reference one of these tokens instead of ad-hoc numbers.
 *
 * Everything here respects the Reduce Motion accessibility setting via
 * useReducedMotion() — durations collapse to `instant`, springs collapse
 * to no-bounce equivalents.
 */

export const MOTION = {
  instant:  0,
  quick:    120,   // press/select feedback
  standard: 240,   // enter/exit
  emphasis: 380,   // hero transitions
  slow:     560,   // celebratory / focus moments
  stagger:  60,    // per-child delay in list-entrance animations
} as const;

export const SPRING_STANDARD = { damping: 18, stiffness: 280, mass: 1 };
export const SPRING_EMPHASIS = { damping: 14, stiffness: 220, mass: 1 };
export const SPRING_BOUNCY   = { damping: 10, stiffness: 200, mass: 1 };
export const SPRING_STIFF    = { damping: 22, stiffness: 380, mass: 1 };
export const SPRING_GENTLE   = { damping: 22, stiffness: 140, mass: 1 };
export const SPRING_NONE     = { damping: 40, stiffness: 300, mass: 1 };

/** Named animation recipes — use these instead of hand-tuning params per site. */
export const ANIM = {
  fadeIn:       { duration: MOTION.standard, useNativeDriver: true },
  fadeOut:      { duration: MOTION.quick,    useNativeDriver: true },
  slideUp:      { duration: MOTION.standard, useNativeDriver: true },
  press:        { duration: MOTION.quick,    useNativeDriver: true },
  entrance:     { duration: MOTION.emphasis, useNativeDriver: true },
  celebration:  { duration: MOTION.slow,     useNativeDriver: true },
} as const;

/** How much a Pressable shrinks on press-in. */
export const PRESS_SCALE = 0.97;

