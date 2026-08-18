import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, ToastAndroid, Alert, View, StyleSheet, Text, Pressable, AppState as RNAppState } from "react-native";
import { StatusBar } from "expo-status-bar";
// Notifee is a native module — stub it so the app doesn't crash if the module
// isn't linked (e.g. development builds without native rebuild).
let notifee: any;
let EventType: any;
try {
  const mod = require("@notifee/react-native");
  notifee = mod.default;
  EventType = mod.EventType;
} catch {
  notifee = {
    getInitialNotification: () => Promise.resolve(null),
    onForegroundEvent: () => () => {},
  };
  EventType = { PRESS: "press", ACTION_PRESS: "action_press" };
}
import { CommonActions } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from "@expo-google-fonts/nunito";
import { applyGlobalFontPatch } from "./src/theme/globalFont";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AppSettingsProvider } from "./src/theme/AppSettingsContext";
import { StringsProvider } from "./src/strings/StringsContext";
import { TabPreferencesProvider } from "./src/context/TabPreferencesContext";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { ToastHost } from "./src/components/ToastHost";
import { WhatsNewModal } from "./src/components/WhatsNewModal";
import { RootTabs } from "./src/navigation/RootTabs";
import { RippleLoader } from "./src/components/RippleLoader";
import { OnboardingFlow } from "./src/screens/OnboardingFlow";
import { LoginScreen } from "./src/screens/LoginScreen";
import { SignupScreen } from "./src/screens/SignupScreen";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { navigationRef } from "./src/navigation/navigationRef";
import { api, ApiError } from "./src/api/client";
import { getToken, setToken, clearToken, registerLogoutHandler } from "./src/lib/auth";
import { syncTimezoneIfChanged } from "./src/lib/timezone";
import {
  isBiometricLockEnabled,
  isCurrentlyUnlocked,
  markUnlocked,
  authenticateWithBiometrics,
  setBiometricLockEnabled,
} from "./src/lib/biometricLock";

type AppState = "loading" | "login" | "signup" | "onboarding" | "app";

// Must match the Tab.Screen names registered in src/navigation/RootTabs.tsx.
type TabName = "Wellness" | "Meals" | "Health" | "Exercise" | "Home" | "Life" | "Finance";

function navigateWhenReady(name: TabName, params?: Record<string, unknown>) {
  const attempt = () => {
    if (navigationRef.isReady()) {
      const screenParams = params ? { ...params } : undefined;
      navigationRef.dispatch(
        CommonActions.navigate({ name: "Tabs", params: { screen: name, params: screenParams } })
      );
      return true;
    }
    return false;
  };
  if (attempt()) return;
  const deadline = Date.now() + 5000;
  const timer = setInterval(() => {
    if (attempt() || Date.now() > deadline) clearInterval(timer);
  }, 50);
}

// Navigate to a screen on the ROOT stack (not inside the Tabs navigator).
function navigateRootWhenReady(name: string) {
  const attempt = () => {
    if (navigationRef.isReady()) {
      navigationRef.dispatch(CommonActions.navigate({ name }));
      return true;
    }
    return false;
  };
  if (attempt()) return;
  const deadline = Date.now() + 5000;
  const timer = setInterval(() => {
    if (attempt() || Date.now() > deadline) clearInterval(timer);
  }, 50);
}

function toast(msg: string) {
  if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
}

async function logWaterFromShortcut() {
  try {
    const metric = await api.getOrCreateWaterMetric();
    await api.logWater(metric.id);
    toast("Water logged");
  } catch (e) {
    toast("Couldn't log water — try again from the app.");
  }
  navigateWhenReady("Health");
}

// Allowed deep-link schemes/hosts — anything else is rejected so a malicious
// link from another app can't spoof a Ripple action.
const DEEP_LINK_SCHEMES = new Set(["ripple:", "https:"]);
const DEEP_LINK_HOSTS = new Set(["", "app", "app.kels.gg"]);
const DEEP_LINK_ACTIONS: Record<string, () => void> = {
  "log-water": () => void logWaterFromShortcut(),
  "meals": () => navigateWhenReady("Meals"),
  "mood": () => navigateWhenReady("Home"),
  "health": () => navigateWhenReady("Health"),
  "wellness": () => navigateWhenReady("Wellness"),
  "glucose": () => navigateWhenReady("Wellness", { scrollTo: "glucose" }),
  "sleep": () => navigateRootWhenReady("SleepDetail"),
  "steps": () => navigateRootWhenReady("StepsDetail"),
  "heartrate": () => navigateRootWhenReady("HeartRateDetail"),
  "insights": () => navigateRootWhenReady("Insights"),
};

function handleUrl(url: string | null) {
  if (!url) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (!DEEP_LINK_SCHEMES.has(parsed.protocol)) return;
  // WHATWG parsing puts the action in the hostname for ripple://<action>,
  // but in the pathname for ripple:///<action> and https://app.kels.gg/<action>.
  let action: string;
  if (DEEP_LINK_HOSTS.has(parsed.hostname)) {
    action = parsed.pathname.replace(/^\/+/, "").split("/")[0];
  } else if (parsed.protocol === "ripple:") {
    action = parsed.hostname;
  } else {
    return;
  }
  DEEP_LINK_ACTIONS[action]?.();
}

function handleNotificationAction(data: any, actionId?: string) {
  const target = data?.target;
  const action = data?.action;

  if (actionId === "log-water") {
    logWaterFromShortcut();
    return;
  }
  if (actionId === "log-meal" || target === "meals") {
    navigateWhenReady("Meals", action === "add" ? { openAddMeal: true } : undefined);
    return;
  }
  if (actionId === "log-mood" || target === "home") {
    navigateWhenReady("Home");
    return;
  }
  if (actionId === "review-today") {
    navigateWhenReady("Home");
    return;
  }
  if (actionId === "log-book" || target === "life") {
    navigateWhenReady("Life");
    return;
  }
  if (actionId === "log-hobby") {
    navigateWhenReady("Life");
    return;
  }
  if (actionId === "log-spend" || target === "finance") {
    navigateWhenReady("Finance");
    return;
  }
  if (target === "health") {
    navigateWhenReady("Health");
    return;
  }
  if (target === "mindfulness") {
    // Mindfulness lives on the root stack (not a tab) — navigate there directly.
    navigateRootWhenReady("Mindfulness");
    return;
  }
  if (target === "exercise") {
    navigateWhenReady("Exercise");
    return;
  }
  if (target === "sleep") {
    navigateWhenReady("Health");
    return;
  }
  if (target === "streak" || target === "weekly") {
    navigateWhenReady("Home");
    return;
  }
}

/** Must be rendered inside ThemeProvider so it can read the current theme. */
function ThemedStatusBar() {
  const { theme } = useTheme();
  return <StatusBar style={theme.isDark ? "light" : "dark"} backgroundColor={theme.page} />;
}

// ── Nav-transition ripple overlay ─────────────────────────────────────────────
// Self-contained so showing/hiding the ripple only re-renders this tiny
// component instead of the whole app tree (previously 2 full-tree renders per
// tab switch). RootTabs' onStateChange calls triggerNavRipple(), which notifies
// the mounted overlay via a module-level listener.
let navRippleListener: (() => void) | null = null;
function triggerNavRipple() {
  navRippleListener?.();
}

function NavRippleOverlay() {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    navRippleListener = () => {
      if (timer.current) clearTimeout(timer.current);
      setVisible(true);
      timer.current = setTimeout(() => setVisible(false), 480);
    };
    return () => {
      navRippleListener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!visible) return null;
  return (
    <View pointerEvents="none" style={transitionStyles.overlay}>
      <RippleLoader size="large" />
    </View>
  );
}

applyGlobalFontPatch();

export default function App() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });
  const [appState, setAppState] = useState<AppState>("loading");
  const [biometricLocked, setBiometricLocked] = useState(false);

  // Register logout handler so Settings can sign the user out
  useEffect(() => {
    registerLogoutHandler(() => setAppState("login"));
    // Sync the device's IANA timezone to the backend so server-side
    // date-boundary math (streaks, today, aggregation) uses the user's
    // local day. Fires once per install unless the TZ actually changes
    // (e.g., travel).
    syncTimezoneIfChanged();
  }, []);

  useEffect(() => {
    const appStateSub = RNAppState.addEventListener("change", async (nextState) => {
      if (nextState === "active") {
        const enabled = await isBiometricLockEnabled().catch(() => false);
        if (enabled && !isCurrentlyUnlocked()) {
          setBiometricLocked(true);
        }
        // Fire local notif if the insights engine surfaced anything new
        // since our last visit. Cheap, rate-limited to one/day, silent on
        // errors so it never breaks the resume flow.
        try {
          const { checkForNewInsightAlerts } = await import("./src/lib/insightAlerts");
          // Detach so an alert-check rejection can't propagate out of the event handler.
          checkForNewInsightAlerts().catch(() => {});
        } catch { /* module load failure — ignore */ }
      }
    });
    return () => appStateSub.remove();
  }, []);

  async function handleBiometricUnlock() {
    const result = await authenticateWithBiometrics();
    if (result === "success") {
      setBiometricLocked(false);
    } else if (result === "unavailable") {
      await setBiometricLockEnabled(false);
      setBiometricLocked(false);
    }
  }

  useEffect(() => {
    initAuth();

    // Notification cold-start
    notifee.getInitialNotification().then((initial) => {
      if (!initial) return;
      handleNotificationAction(initial.notification?.data, initial.pressAction?.id);
    });

    // Deep-link cold-start
    Linking.getInitialURL().then(handleUrl);

    const unsubscribeNotif = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
        handleNotificationAction(detail.notification?.data, detail.pressAction?.id);
      }
    });

    const linkingSub = Linking.addEventListener("url", ({ url }) => handleUrl(url));

    return () => {
      unsubscribeNotif();
      linkingSub.remove();
    };
  }, []);

  async function initAuth() {
    const token = await getToken();
    if (!token) {
      setAppState("login");
      return;
    }
    // Keep the widget auth file in sync on every launch so the Android home
    // screen widget can always find the token (setToken is only called at login).
    setToken(token).catch(() => {});
    try {
      const user = await api.me();
      if (!user) throw new Error("no user");
      markUnlocked();
      setBiometricLocked(false);
      setAppState(user.onboarding_completed ? "app" : "onboarding");
    } catch (err: any) {
      // Only clear the token on actual auth rejection (401/403). Network errors or
      // server hiccups should not log the user out — just trust the stored token.
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        await clearToken();
        setAppState("login");
      } else {
        markUnlocked();
        setBiometricLocked(false);
        setAppState("app");
      }
    }
  }

  async function handleLoginSuccess() {
    try {
      const user = await api.me();
      markUnlocked();
      setBiometricLocked(false);
      setAppState(user?.onboarding_completed ? "app" : "onboarding");
    } catch {
      markUnlocked();
      setBiometricLocked(false);
      setAppState("app");
    }
  }

  async function handleOnboardingComplete() {
    try {
      await api.markOnboardingComplete();
    } catch (_) {}
    markUnlocked();
    setBiometricLocked(false);
    setAppState("app");
  }

  if (appState === "loading" || !fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          {/* No ThemeProvider yet — use a neutral dark-safe background */}
          <StatusBar style="dark" />
          <View style={{ flex: 1, backgroundColor: "#F5F1E8" }} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (appState === "login") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppErrorBoundary>
            <ThemeProvider>
              <AppSettingsProvider>
                <StringsProvider>
                <ThemedStatusBar />
                <LoginScreen
                  onLoginSuccess={handleLoginSuccess}
                  onShowSignup={() => setAppState("signup")}
                />
                </StringsProvider>
              </AppSettingsProvider>
            </ThemeProvider>
          </AppErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (appState === "signup") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppErrorBoundary>
            <ThemeProvider>
              <AppSettingsProvider>
                <StringsProvider>
                <ThemedStatusBar />
                <SignupScreen
                  onSignupSuccess={() => { markUnlocked(); setBiometricLocked(false); setAppState("onboarding"); }}
                  onBackToLogin={() => setAppState("login")}
                />
                </StringsProvider>
              </AppSettingsProvider>
            </ThemeProvider>
          </AppErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  if (appState === "onboarding") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppErrorBoundary>
            <ThemeProvider>
              <AppSettingsProvider>
                <StringsProvider>
                <ThemedStatusBar />
                <OnboardingFlow onComplete={handleOnboardingComplete} />
                </StringsProvider>
              </AppSettingsProvider>
            </ThemeProvider>
          </AppErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <AppErrorBoundary>
        <ThemeProvider>
          <AppSettingsProvider>
          <StringsProvider>
          <TabPreferencesProvider>
          <ThemedStatusBar />
          <RootTabs onNavigationStateChange={triggerNavRipple} />
          <ToastHost />
          <OfflineBanner />
          <NavRippleOverlay />
          <WhatsNewModal />
          {biometricLocked && (
            <View style={lockStyles.overlay}>
              <RippleLoader size="large" style={lockStyles.loader} />
              <Text style={lockStyles.appName}>Ripple</Text>
              <Text style={lockStyles.subtitle}>Your data is private</Text>
              <Pressable onPress={handleBiometricUnlock} style={lockStyles.unlockBtn}>
                <Text style={lockStyles.unlockBtnText}>Unlock with Biometrics</Text>
              </Pressable>
            </View>
          )}
          </TabPreferencesProvider>
          </StringsProvider>
          </AppSettingsProvider>
        </ThemeProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const transitionStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9997,
  },
});

const lockStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#161A20",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  loader: { marginBottom: 24 },
  appName: { color: "#FFFFFF", fontSize: 32, fontWeight: "800", marginBottom: 8 },
  subtitle: { color: "#9BA3AF", fontSize: 14, marginBottom: 40 },
  unlockBtn: {
    backgroundColor: "#4AB8D0",
    borderRadius: 14,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  unlockBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
});
