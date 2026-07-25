import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { buildTheme, BG_PRESETS, DEFAULT_PRESET, BgPreset, LoadingVariant, Theme } from "./theme";

const MODE_KEY = "ripple:theme_mode";
const PRESET_KEY = "ripple:theme_preset";

type ThemeContextValue = {
  theme: Theme;
  mode: "light" | "dark";
  toggle: () => void;
  preset: BgPreset;
  setPreset: (p: BgPreset) => void;
  loadingVariant: LoadingVariant;
  themeReady: boolean;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode]     = useState<"light" | "dark">("light");
  const [preset, setPresetState] = useState<BgPreset>(DEFAULT_PRESET);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([MODE_KEY, PRESET_KEY]).then(([[, savedMode], [, savedPreset]]) => {
      if (savedMode === "dark") setMode("dark");
      if (savedPreset) {
        const found = BG_PRESETS.find((p) => p.id === savedPreset);
        if (found) setPresetState(found);
      }
      setThemeReady(true);
    });
  }, []);

  function toggle() {
    setMode((m) => {
      const next = m === "light" ? "dark" : "light";
      AsyncStorage.setItem(MODE_KEY, next);
      return next;
    });
  }

  function setPreset(p: BgPreset) {
    setPresetState(p);
    AsyncStorage.setItem(PRESET_KEY, p.id);
  }

  const theme = buildTheme(preset, mode === "dark");
  const loadingVariant: LoadingVariant = preset.loadingVariant;

  return (
    <ThemeContext.Provider value={{ theme, mode, toggle, preset, setPreset, loadingVariant, themeReady }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
