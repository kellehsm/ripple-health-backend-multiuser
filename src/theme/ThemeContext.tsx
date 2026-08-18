import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import type { Theme } from "./theme";
import {
  PALETTES,
  DEFAULT_PALETTE_ID,
  THEME_FAMILIES,
  familyForPalette,
  type ThemeFamily,
} from "./palettes";

const STORAGE_KEY = "ripple_palette_id";

type ThemeContextValue = {
  theme: Theme;
  paletteId: string;
  setPalette: (id: string) => void;
  /** The light/dark family the current palette belongs to. */
  family: ThemeFamily;
  /** Switch families, keeping the current light/dark mode. */
  setFamily: (familyId: string) => void;
  mode: "light" | "dark";   // derived from theme.isDark
  /** Explicitly set light/dark within the current family. */
  setMode: (mode: "light" | "dark") => void;
  /** Toggle light ↔ dark within the current family. */
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID);

  // Load persisted palette on mount; new installs always start on morning-mist
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (stored && PALETTES[stored]) setPaletteId(stored);
      })
      .catch(() => {});
  }, []);

  const setPalette = useCallback((id: string) => {
    if (!PALETTES[id]) return;
    setPaletteId(id);
    SecureStore.setItemAsync(STORAGE_KEY, id).catch(() => {});
  }, []);

  const theme = PALETTES[paletteId] ?? PALETTES[DEFAULT_PALETTE_ID];
  const mode: "light" | "dark" = theme.isDark ? "dark" : "light";
  const family = familyForPalette(theme.id);

  // Write widget_theme.json so the Android widget can pick up themed accent colors.
  // Fire-and-forget; only on Android.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    try {
      const accents = JSON.stringify({
        teal:   theme.teal.solid,
        coral:  theme.coral.solid,
        purple: theme.purple.solid,
        berry:  theme.berry.solid,
      });
      FileSystem.writeAsStringAsync(
        FileSystem.documentDirectory + "widget_theme.json",
        accents
      ).catch(() => {});
    } catch (_) {}
  }, [theme.teal.solid, theme.coral.solid, theme.purple.solid, theme.berry.solid]);

  const setFamily = useCallback((familyId: string) => {
    const fam = THEME_FAMILIES.find((f) => f.id === familyId);
    if (!fam) return;
    setPalette(theme.isDark ? fam.dark : fam.light);
  }, [theme.isDark, setPalette]);

  const setMode = useCallback((m: "light" | "dark") => {
    const fam = familyForPalette(theme.id);
    setPalette(m === "dark" ? fam.dark : fam.light);
  }, [theme.id, setPalette]);

  const toggle = useCallback(() => {
    const fam = familyForPalette(theme.id);
    setPalette(theme.isDark ? fam.light : fam.dark);
  }, [theme.id, theme.isDark, setPalette]);

  const value = useMemo(
    () => ({ theme, paletteId, setPalette, family, setFamily, mode, setMode, toggle }),
    [theme, paletteId, setPalette, family, setFamily, mode, setMode, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
