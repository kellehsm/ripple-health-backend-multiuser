import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "ripple.reduceMotion";

let reduced = false;

export function setReducedMotion(v: boolean) {
  reduced = v;
}

export function isReducedMotion(): boolean {
  return reduced;
}

export async function loadReducedMotion(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(KEY);
    if (stored !== null) {
      reduced = stored === "true";
    }
  } catch {
    // Silently ignore — defaults to false
  }
}

export async function persistReducedMotion(v: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, v ? "true" : "false");
  } catch {
    // Silently ignore
  }
}
