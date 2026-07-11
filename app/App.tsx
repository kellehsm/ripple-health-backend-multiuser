import React from "react";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider } from "./src/theme/ThemeContext";
import { RootTabs } from "./src/navigation/RootTabs";

export default function App() {
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <RootTabs />
    </ThemeProvider>
  );
}
