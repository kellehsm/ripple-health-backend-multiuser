import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { clearAllBarcodeCache } from "../utils/barcodeCache";

const TOKEN_KEY = "ripple_jwt";
const WIDGET_AUTH_FILE = "widget_auth.json";

export interface UserInfo {
  id: string;
  email: string;
  onboarding_completed: boolean;
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  // Mirror to a plain file so the Android widget (same package) can read it
  try {
    await FileSystem.writeAsStringAsync(
      FileSystem.documentDirectory + WIDGET_AUTH_FILE,
      JSON.stringify({ token })
    );
  } catch {}
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  try {
    const path = FileSystem.documentDirectory + WIDGET_AUTH_FILE;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path);
  } catch {}
}

export async function getUserId(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.user_id ?? null;
  } catch {
    return null;
  }
}

// Logout hook — App registers this so Settings can trigger a full sign-out
let _logoutHandler: (() => void) | null = null;

export function registerLogoutHandler(cb: () => void): void {
  _logoutHandler = cb;
}

export async function logout(): Promise<void> {
  await clearToken();
  try { clearAllBarcodeCache(); } catch {}
  _logoutHandler?.();
}
