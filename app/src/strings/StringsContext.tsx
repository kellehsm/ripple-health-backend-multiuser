import React, { createContext, useContext, useMemo } from "react";
import { useTheme } from "../theme/ThemeContext";
import { DEFAULT_STRINGS, StringMap } from "./defaults";

const StringsContext = createContext<StringMap>(DEFAULT_STRINGS as unknown as StringMap);

/**
 * Provides the active string map to the component tree.
 *
 * Per-theme string overrides are read from `(theme as any).strings`.
 * If a theme defines a `.strings` object, its keys are merged over the
 * defaults — allowing full white-label / locale customisation without
 * touching screen code.
 */
export function StringsProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  const strings = useMemo<StringMap>(() => {
    const overrides = (theme as any).strings ?? {};
    return { ...DEFAULT_STRINGS, ...overrides } as StringMap;
  }, [theme]);

  return (
    <StringsContext.Provider value={strings}>
      {children}
    </StringsContext.Provider>
  );
}

export function useStrings(): StringMap {
  return useContext(StringsContext);
}
