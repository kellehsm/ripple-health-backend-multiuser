import * as SecureStore from "expo-secure-store";

export type MilestoneKey =
  | "steps_daily"
  | "meal_streak"
  | "mood_streak"
  | "water_streak"
  | "step_goal_streak"
  | "exercise_streak"
  | "reading_streak"
  | "hobby_streak"
  | "mindfulness_streak";

export type MilestoneResult = {
  isNew: boolean;
  prev: number;
  current: number;
  key: MilestoneKey;
};

const PREFIX = "milestone_pb_";

export async function checkMilestone(
  key: MilestoneKey,
  current: number
): Promise<MilestoneResult> {
  if (!Number.isFinite(current) || current <= 0) {
    return { isNew: false, prev: 0, current, key };
  }
  const stored = await SecureStore.getItemAsync(PREFIX + key).catch(() => null);
  const prev = stored ? parseInt(stored, 10) : 0;
  if (current > prev) {
    await SecureStore.setItemAsync(PREFIX + key, String(current)).catch(() => {});
    return { isNew: true, prev, current, key };
  }
  return { isNew: false, prev, current, key };
}

const ROUND_MILESTONE_COPY: Partial<Record<number, string>> = {
  7:   "7 days — you've built a real habit 🌿",
  30:  "A full month! That's real dedication 🌊",
  100: "100 days. Legendary. 🏆",
};

export function milestoneCopy(result: MilestoneResult): string {
  // Special round-number milestones override generic copy for all streak types
  if (result.key !== "steps_daily" && ROUND_MILESTONE_COPY[result.current]) {
    return ROUND_MILESTONE_COPY[result.current]!;
  }
  switch (result.key) {
    case "steps_daily":
      return `New personal best! ${result.current.toLocaleString()} steps today`;
    case "meal_streak":
      return `New record! ${result.current}-day meal logging streak`;
    case "mood_streak":
      return `New record! ${result.current}-day mood check-in streak`;
    case "water_streak":
      return `New record! ${result.current}-day water logging streak`;
    case "step_goal_streak":
      return `New record! ${result.current}-day step goal streak`;
    case "exercise_streak":
      return `New record! ${result.current}-day exercise streak`;
    case "reading_streak":
      return `New record! ${result.current}-day reading streak`;
    case "hobby_streak":
      return `New record! ${result.current}-day hobbies streak`;
    case "mindfulness_streak":
      return `New record! ${result.current}-day mindfulness streak`;
  }
}
