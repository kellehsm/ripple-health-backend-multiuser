import React, { createContext, useContext } from "react";

interface ThemeEditContextValue {
  editMode: boolean;
  selectedId: string | null;
  selectElement: (id: string, kind: "card" | "tile") => void;
}

const ThemeEditContext = createContext<ThemeEditContextValue>({
  editMode: false,
  selectedId: null,
  selectElement: () => {},
});

export function useThemeEdit() {
  return useContext(ThemeEditContext);
}

export { ThemeEditContext };
