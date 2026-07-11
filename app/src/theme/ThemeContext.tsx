import React, { createContext, useContext, useState } from "react";
import { lightTheme, darkTheme, Theme } from "./theme";

type ThemeContextValue = {
  theme: Theme;
  mode: "light" | "dark";
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const theme = mode === "light" ? lightTheme : darkTheme;
  const toggle = () => setMode((m) => (m === "light" ? "dark" : "light"));
  return <ThemeContext.Provider value={{ theme, mode, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
