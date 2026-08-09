import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTheme } from "../theme/ThemeContext";
import { DEFAULT_STRINGS, StringMap } from "./defaults";
import { LOCALES, LocaleKey } from "./es";

const LOCALE_KEY = "ripple_locale";

interface CtxValue {
  strings: StringMap;
  locale: LocaleKey;
  setLocale: (v: LocaleKey) => void;
}

const StringsContext = createContext<CtxValue>({
  strings: DEFAULT_STRINGS as unknown as StringMap,
  locale: "en",
  setLocale: () => {},
});

/**
 * Provides the active string map to the component tree.
 *
 * Merge priority (lowest → highest):
 *   1. DEFAULT_STRINGS (English)
 *   2. Locale partial (Spanish, etc.)
 *   3. Per-theme string overrides
 *
 * Any key missing from a locale partial falls back to English — safe by default.
 */
export function StringsProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const [locale, setLocaleState] = useState<LocaleKey>("en");

  useEffect(() => {
    AsyncStorage.getItem(LOCALE_KEY).then((v) => {
      if (v && (v === "en" || v === "es")) setLocaleState(v as LocaleKey);
    }).catch(() => {});
  }, []);

  const setLocale = useCallback((v: LocaleKey) => {
    setLocaleState(v);
    AsyncStorage.setItem(LOCALE_KEY, v).catch(() => {});
  }, []);

  const strings = useMemo<StringMap>(() => {
    const localePartial = LOCALES[locale] ?? {};
    const overrides = (theme as any).strings ?? {};
    return { ...DEFAULT_STRINGS, ...localePartial, ...overrides } as StringMap;
  }, [theme, locale]);

  return (
    <StringsContext.Provider value={{ strings, locale, setLocale }}>
      {children}
    </StringsContext.Provider>
  );
}

export function useStrings(): StringMap {
  return useContext(StringsContext).strings;
}

export function useLocale(): { locale: LocaleKey; setLocale: (v: LocaleKey) => void } {
  const { locale, setLocale } = useContext(StringsContext);
  return { locale, setLocale };
}
