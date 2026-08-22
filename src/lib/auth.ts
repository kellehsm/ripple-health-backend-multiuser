import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { clearAllBarcodeCache } from "../utils/barcodeCache";
import { BASE_URL } from "../api/baseUrl";

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
  // The widget reads its token from a plain file (SecureStore isn't reachable
  // from the widget process), so we write a widget-SCOPED token there instead
  // of the main JWT — a leaked file only grants the widget's few endpoints.
  void refreshWidgetToken(token);
}

async function refreshWidgetToken(mainToken: string): Promise<void> {
  try {
    const res = await fetch(BASE_URL + "/auth/widget-token", {
      method: "POST",
      headers: { Authorization: "Bearer " + mainToken },
    });
    if (!res.ok) return; // keep the previous widget token; retried on next app open
    const { token } = await res.json();
    if (!token) return;
    await FileSystem.writeAsStringAsync(
      FileSystem.documentDirectory + WIDGET_AUTH_FILE,
      JSON.stringify({ token })
    );
  } catch (err) {
    console.warn("Widget token refresh failed:", err);
  }
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  try {
    const path = FileSystem.documentDirectory + WIDGET_AUTH_FILE;
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path);
  } catch (err) {
    console.warn("Failed to delete widget auth file on logout:", err);
  }
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
  // Dynamic import: client.ts imports this module, so a static import would cycle
  try {
    const { clearMetricCaches } = await import("../api/client");
    clearMetricCaches();
  } catch {}
  _logoutHandler?.();
}
