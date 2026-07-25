import React, { useState, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts, Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from "@expo-google-fonts/nunito";
import { ThemeProvider } from "./src/theme/ThemeContext";
import { FeaturesProvider } from "./src/context/FeaturesContext";
import { RootStack } from "./src/navigation/RootStack";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { LoadingScreen } from "./src/components/LoadingScreen";
import { logAppOpen } from "./src/services/adaptiveTimingService";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { useTheme } from "./src/theme/ThemeContext";
import { useFeatures } from "./src/context/FeaturesContext";

const ONBOARDING_KEY = "ripple:onboarding_complete";

function AppContent({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { themeReady } = useTheme();
  const { featuresLoaded } = useFeatures();
  const [appLoading, setAppLoading] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);

  useEffect(() => {
    async function init() {
      const [done] = await Promise.all([
        AsyncStorage.getItem(ONBOARDING_KEY),
        logAppOpen(),
      ]);
      setOnboardingDone(done === "true");
      setAppLoading(false);
    }
    init();
  }, []);

  if (!fontsLoaded || !themeReady || !featuresLoaded || appLoading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <StatusBar style="auto" />
      {onboardingDone ? (
        <RootStack />
      ) : (
        <OnboardingScreen onComplete={() => setOnboardingDone(true)} />
      )}
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Nunito_400Regular, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <FeaturesProvider>
          <AppContent fontsLoaded={!!fontsLoaded} />
        </FeaturesProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
