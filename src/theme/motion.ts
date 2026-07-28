export const MOTION = {
  instant:  0,
  quick:    120,
  standard: 240,
  emphasis: 380,
  stagger:  60,
} as const;

export const SPRING_STANDARD = { damping: 18, stiffness: 280, mass: 1 };
export const SPRING_EMPHASIS  = { damping: 14, stiffness: 220, mass: 1 };
export const SPRING_BOUNCY    = { damping: 10, stiffness: 200, mass: 1 };
