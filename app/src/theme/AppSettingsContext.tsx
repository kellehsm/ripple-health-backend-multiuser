import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type FontFamilyKey,
  type FontScalePreset,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SCALE,
  FONT_FAMILY_KEYS,
  FONT_SCALE_KEYS,
} from "./fontSystem";
import { layeredShadow, ShadowSize } from "./styleUtils";
import { useTheme } from "./ThemeContext";
import { api } from "../api/client";

// ─── Types ─────────────────────────────────────────────────────────────────────

export const CARD_OPACITY_MIN = 0.30;
export const CARD_OPACITY_MAX = 1.0;
const DEFAULT_OPACITY = 1.0;

type AppSettings = {
  shadowsEnabled: boolean;
  fontFamily: FontFamilyKey;
  fontSizeScale: FontScalePreset;
  cardOpacity: number;
  cardOpacityManualOverride: boolean;
};

type AppSettingsContextValue = AppSettings & {
  setShadowsEnabled: (v: boolean) => void;
  setFontFamily: (v: FontFamilyKey) => void;
  setFontSizeScale: (v: FontScalePreset) => void;
  setCardOpacity: (v: number) => void;
  resetCardOpacity: () => void;
};

// ─── Storage keys ──────────────────────────────────────────────────────────────

const KEY_SHADOWS          = "ripple_shadows_enabled";
const KEY_FONT_FAMILY      = "ripple_font_family";
const KEY_FONT_SCALE       = "ripple_font_scale";
const KEY_CARD_OPACITY     = "ripple_card_opacity";
const KEY_OPACITY_OVERRIDE = "ripple_card_opacity_override";

// ─── Context ───────────────────────────────────────────────────────────────────

const AppSettingsContext = createContext<AppSettingsContextValue>({
  shadowsEnabled: true,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSizeScale: DEFAULT_FONT_SCALE,
  cardOpacity: DEFAULT_OPACITY,
  cardOpacityManualOverride: false,
  setShadowsEnabled: () => {},
  setFontFamily: () => {},
  setFontSizeScale: () => {},
  setCardOpacity: () => {},
  resetCardOpacity: () => {},
});

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const { theme, paletteId } = useTheme();

  const [shadowsEnabled, setShadowsEnabledState] = useState(true);
  const [fontFamily, setFontFamilyState] = useState<FontFamilyKey>(DEFAULT_FONT_FAMILY);
  const [fontSizeScale, setFontSizeScaleState] = useState<FontScalePreset>(DEFAULT_FONT_SCALE);
  const [cardOpacity, setCardOpacityState] = useState(DEFAULT_OPACITY);
  const [cardOpacityManualOverride, setCardOpacityManualOverrideState] = useState(false);

  // Ref so palette-change effect can read current override without stale closure
  const manualOverrideRef = useRef(false);

  // ── Load persisted settings on mount ──────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [shadows, ff, scale, opacity, override] = await Promise.all([
        AsyncStorage.getItem(KEY_SHADOWS),
        AsyncStorage.getItem(KEY_FONT_FAMILY),
        AsyncStorage.getItem(KEY_FONT_SCALE),
        AsyncStorage.getItem(KEY_CARD_OPACITY),
        AsyncStorage.getItem(KEY_OPACITY_OVERRIDE),
      ]);

      if (shadows !== null) setShadowsEnabledState(shadows !== "false");
      if (ff !== null && FONT_FAMILY_KEYS.includes(ff as FontFamilyKey)) {
        setFontFamilyState(ff as FontFamilyKey);
      }
      if (scale !== null && FONT_SCALE_KEYS.includes(scale as FontScalePreset)) {
        setFontSizeScaleState(scale as FontScalePreset);
      }

      if (override === "true" && opacity !== null) {
        const parsed = parseFloat(opacity);
        if (!isNaN(parsed)) {
          setCardOpacityState(parsed);
          setCardOpacityManualOverrideState(true);
          manualOverrideRef.current = true;
        }
      }

      // Backend sync (non-blocking; overrides AsyncStorage if server has a value)
      try {
        const settings = await api.getSettings();
        if (settings?.cardOpacity !== undefined && settings?.cardOpacity !== null && settings?.cardOpacityManualOverride) {
          const v = parseFloat(settings.cardOpacity);
          if (!isNaN(v)) {
            setCardOpacityState(v);
            setCardOpacityManualOverrideState(true);
            manualOverrideRef.current = true;
            AsyncStorage.setItem(KEY_CARD_OPACITY, String(v)).catch(() => {});
            AsyncStorage.setItem(KEY_OPACITY_OVERRIDE, "true").catch(() => {});
          }
        }
      } catch {}
    };
    load();
  }, []);

  // ── Apply theme default when palette changes (unless user has overridden) ──
  useEffect(() => {
    if (manualOverrideRef.current) return;
    const themeDefault = theme.defaultCardOpacity ?? DEFAULT_OPACITY;
    setCardOpacityState(themeDefault);
  }, [paletteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Setters ────────────────────────────────────────────────────────────────

  const setShadowsEnabled = useCallback((v: boolean) => {
    setShadowsEnabledState(v);
    AsyncStorage.setItem(KEY_SHADOWS, String(v)).catch(() => {});
  }, []);

  const setFontFamily = useCallback((v: FontFamilyKey) => {
    setFontFamilyState(v);
    AsyncStorage.setItem(KEY_FONT_FAMILY, v).catch(() => {});
  }, []);

  const setFontSizeScale = useCallback((v: FontScalePreset) => {
    setFontSizeScaleState(v);
    AsyncStorage.setItem(KEY_FONT_SCALE, v).catch(() => {});
  }, []);

  const setCardOpacity = useCallback((v: number) => {
    const clamped = Math.max(CARD_OPACITY_MIN, Math.min(CARD_OPACITY_MAX, v));
    setCardOpacityState(clamped);
    setCardOpacityManualOverrideState(true);
    manualOverrideRef.current = true;
    AsyncStorage.setItem(KEY_CARD_OPACITY, String(clamped)).catch(() => {});
    AsyncStorage.setItem(KEY_OPACITY_OVERRIDE, "true").catch(() => {});
    api.patchSettings({ cardOpacity: clamped, cardOpacityManualOverride: true }).catch(() => {});
  }, []);

  const resetCardOpacity = useCallback(() => {
    const themeDefault = theme.defaultCardOpacity ?? DEFAULT_OPACITY;
    setCardOpacityState(themeDefault);
    setCardOpacityManualOverrideState(false);
    manualOverrideRef.current = false;
    AsyncStorage.removeItem(KEY_CARD_OPACITY).catch(() => {});
    AsyncStorage.removeItem(KEY_OPACITY_OVERRIDE).catch(() => {});
    api.patchSettings({ cardOpacity: null, cardOpacityManualOverride: false }).catch(() => {});
  }, [theme.defaultCardOpacity]);

  return (
    <AppSettingsContext.Provider
      value={{
        shadowsEnabled, fontFamily, fontSizeScale, cardOpacity, cardOpacityManualOverride,
        setShadowsEnabled, setFontFamily, setFontSizeScale, setCardOpacity, resetCardOpacity,
      }}
    >
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettingsContextValue {
  return useContext(AppSettingsContext);
}

/**
 * Returns layered shadow style when shadows are enabled, {} when disabled.
 */
export function useCardShadow(size?: ShadowSize): Record<string, unknown> {
  const { shadowsEnabled } = useAppSettings();
  const { theme } = useTheme();
  if (!shadowsEnabled) return {};
  return layeredShadow(size ?? "card", theme.isDark) as Record<string, unknown>;
}
