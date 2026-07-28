import * as SecureStore from "expo-secure-store";

export type MilestoneKey =
  | "steps_daily"
  | "meal_streak"
  | "mood_streak"
  | "water_streak"
  | "step_goal_streak";

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

export function milestoneCopy(result: MilestoneResult): string {
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
  }
}
