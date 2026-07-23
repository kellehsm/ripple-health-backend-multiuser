import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ThemeProvider } from "./src/theme/ThemeContext";
import { RootStack } from "./src/navigation/RootStack";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { logAppOpen } from "./src/services/adaptiveTimingService";
import { ErrorBoundary } from "./src/components/ErrorBoundary";

const ONBOARDING_KEY = "ripple:onboarding_complete";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    async function init() {
      const [done] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_KEY),
        logAppOpen(),
      ]);
      setOnboardingDone(done === "true");
      setLoading(false);
    }
    init();
  }, []);

  if (loading) return null;

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <StatusBar style="auto" />
        {onboardingDone ? (
          <RootStack />
        ) : (
          <OnboardingScreen onComplete={() => setOnboardingDone(true)} />
        )}
      </ThemeProvider>
    </ErrorBoundary>
  );
}
