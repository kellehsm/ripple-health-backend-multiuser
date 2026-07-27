/**
 * BackgroundsContext — stores per-page, per-card, and per-tile background overrides.
 * Persists only serializable backgrounds (uri, color) to AsyncStorage.
 * Local image require() assets cannot round-trip through JSON, so they're excluded.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type ThemeableBackground } from "./pageTemplates";

// ─── Types ────────────────────────────────────────────────────────────────────

type BgMap = Record<string, ThemeableBackground>;

type BackgroundsState = {
  pageBackgrounds: BgMap;
  cardBackgrounds: BgMap;
  tileBackgrounds: BgMap;
};

type BackgroundsContextValue = BackgroundsState & {
  setPageBackground: (id: string, bg: ThemeableBackground | null) => void;
  setCardBackground: (id: string, bg: ThemeableBackground | null) => void;
  setTileBackground: (id: string, bg: ThemeableBackground | null) => void;
  clearAll: () => void;
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ripple_bg_overrides";

/** Only serialize backgrounds that can round-trip through JSON (no require() assets). */
function isSerializable(bg: ThemeableBackground): boolean {
  return bg.type === "uri" || bg.type === "color";
}

function serializeState(state: { pageBgs: BgMap; cardBgs: BgMap; tileBgs: BgMap }): string {
  const filterSerializable = (map: BgMap): BgMap =>
    Object.fromEntries(Object.entries(map).filter(([, v]) => isSerializable(v)));
  return JSON.stringify({
    pageBgs: filterSerializable(state.pageBgs),
    cardBgs: filterSerializable(state.cardBgs),
    tileBgs: filterSerializable(state.tileBgs),
  });
}

async function loadFromStorage(): Promise<{ pageBgs: BgMap; cardBgs: BgMap; tileBgs: BgMap }> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { pageBgs: {}, cardBgs: {}, tileBgs: {} };
    const parsed = JSON.parse(raw);
    return {
      pageBgs: parsed.pageBgs ?? {},
      cardBgs: parsed.cardBgs ?? {},
      tileBgs: parsed.tileBgs ?? {},
    };
  } catch {
    return { pageBgs: {}, cardBgs: {}, tileBgs: {} };
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const BackgroundsContext = createContext<BackgroundsContextValue>({
  pageBackgrounds: {},
  cardBackgrounds: {},
  tileBackgrounds: {},
  setPageBackground: () => {},
  setCardBackground: () => {},
  setTileBackground: () => {},
  clearAll: () => {},
});

export function BackgroundsProvider({ children }: { children: React.ReactNode }) {
  // All three maps in one atomic state object to avoid stale closures in setters
  const [bgs, setBgs] = useState<{ pageBgs: BgMap; cardBgs: BgMap; tileBgs: BgMap }>({
    pageBgs: {},
    cardBgs: {},
    tileBgs: {},
  });

  // Load persisted state on mount
  useEffect(() => {
    loadFromStorage().then((loaded) => setBgs(loaded));
  }, []);

  // Persist on every change
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, serializeState(bgs)).catch(() => {});
  }, [bgs]);

  const setPageBackground = useCallback((id: string, bg: ThemeableBackground | null) => {
    setBgs((prev) => {
      const next = { ...prev.pageBgs };
      if (bg === null) delete next[id];
      else next[id] = bg;
      return { ...prev, pageBgs: next };
    });
  }, []);

  const setCardBackground = useCallback((id: string, bg: ThemeableBackground | null) => {
    setBgs((prev) => {
      const next = { ...prev.cardBgs };
      if (bg === null) delete next[id];
      else next[id] = bg;
      return { ...prev, cardBgs: next };
    });
  }, []);

  const setTileBackground = useCallback((id: string, bg: ThemeableBackground | null) => {
    setBgs((prev) => {
      const next = { ...prev.tileBgs };
      if (bg === null) delete next[id];
      else next[id] = bg;
      return { ...prev, tileBgs: next };
    });
  }, []);

  const clearAll = useCallback(() => {
    setBgs({ pageBgs: {}, cardBgs: {}, tileBgs: {} });
  }, []);

  return (
    <BackgroundsContext.Provider
      value={{
        pageBackgrounds: bgs.pageBgs,
        cardBackgrounds: bgs.cardBgs,
        tileBackgrounds: bgs.tileBgs,
        setPageBackground,
        setCardBackground,
        setTileBackground,
        clearAll,
      }}
    >
      {children}
    </BackgroundsContext.Provider>
  );
}

export function useBackgrounds(): BackgroundsContextValue {
  return useContext(BackgroundsContext);
}
