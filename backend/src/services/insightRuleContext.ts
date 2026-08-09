/**
 * Shared execution context passed to every rule during a single user's
 * insights-engine run. Rules that opt in read from `ctx.frame` instead of
 * hitting Postgres — cutting query volume dramatically.
 *
 * Rules stay backwards compatible: the old `run(userId, capabilities)`
 * signature still works. New/upgraded rules use `runWithContext(ctx)` when
 * present (checked by the engine).
 */

import type { UserCapabilities } from "../rules/types.js";
import type { DayFrame } from "./dayFrame.js";

export interface RuleContext {
  userId: string;
  capabilities: UserCapabilities;
  frame: DayFrame;
  // Rule tier being executed on this pass ("daily" | "semiweekly" | "weekly")
  currentTier: "daily" | "semiweekly" | "weekly";
  now: Date;
}
