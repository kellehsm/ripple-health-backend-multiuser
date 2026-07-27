import * as SecureStore from "expo-secure-store";

const PREFIX = "tooltip_seen_";

export async function hasSeenTooltip(key: string): Promise<boolean> {
  const val = await SecureStore.getItemAsync(PREFIX + key).catch(() => "1");
  return val === "1";
}

export async function markTooltipSeen(key: string): Promise<void> {
  await SecureStore.setItemAsync(PREFIX + key, "1").catch(() => {});
}
