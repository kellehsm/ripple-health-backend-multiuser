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
import { hexWithAlpha, blendWithWhite } from "./colorUtils";
import { FONT_FAMILIES, setFontFamilyOverride } from "./typography";
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
  cardGlass: boolean;
};

type AppSettingsContextValue = AppSettings & {
  setShadowsEnabled: (v: boolean) => void;
  setFontFamily: (v: FontFamilyKey) => void;
  setFontSizeScale: (v: FontScalePreset) => void;
  setCardOpacity: (v: number) => void;
  resetCardOpacity: () => void;
  setCardGlass: (v: boolean) => void;
};

// ─── Storage keys ──────────────────────────────────────────────────────────────

const KEY_SHADOWS          = "ripple_shadows_enabled";
const KEY_FONT_FAMILY      = "ripple_font_family";
const KEY_FONT_SCALE       = "ripple_font_scale";
const KEY_CARD_OPACITY     = "ripple_card_opacity";
const KEY_OPACITY_OVERRIDE = "ripple_card_opacity_override";
const KEY_CARD_GLASS       = "ripple_card_glass";

// ─── Context ───────────────────────────────────────────────────────────────────

const AppSettingsContext = createContext<AppSettingsContextValue>({
  shadowsEnabled: true,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSizeScale: DEFAULT_FONT_SCALE,
  cardOpacity: DEFAULT_OPACITY,
  cardOpacityManualOverride: false,
  cardGlass: false,
  setShadowsEnabled: () => {},
  setFontFamily: () => {},
  setFontSizeScale: () => {},
  setCardOpacity: () => {},
  resetCardOpacity: () => {},
  setCardGlass: () => {},
});

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const { theme, paletteId } = useTheme();

  const [shadowsEnabled, setShadowsEnabledState] = useState(true);
  const [fontFamily, setFontFamilyState] = useState<FontFamilyKey>(DEFAULT_FONT_FAMILY);
  const [fontSizeScale, setFontSizeScaleState] = useState<FontScalePreset>(DEFAULT_FONT_SCALE);
  const [cardOpacity, setCardOpacityState] = useState(DEFAULT_OPACITY);
  const [cardOpacityManualOverride, setCardOpacityManualOverrideState] = useState(false);
  const [cardGlass, setCardGlassState] = useState(false);

  // Ref so palette-change effect can read current override without stale closure
  const manualOverrideRef = useRef(false);

  // ── Load persisted settings on mount ──────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const [shadows, ff, scale, opacity, override, glass] = await Promise.all([
        AsyncStorage.getItem(KEY_SHADOWS),
        AsyncStorage.getItem(KEY_FONT_FAMILY),
        AsyncStorage.getItem(KEY_FONT_SCALE),
        AsyncStorage.getItem(KEY_CARD_OPACITY),
        AsyncStorage.getItem(KEY_OPACITY_OVERRIDE),
        AsyncStorage.getItem(KEY_CARD_GLASS),
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

      if (glass !== null) setCardGlassState(glass === "true");

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

  // ── Propagate fontFamily to the mutable singleton in typography.ts ──────
  useEffect(() => {
    const ff = FONT_FAMILIES[fontFamily ?? "System"];
    setFontFamilyOverride(typeof ff === "string" ? ff : undefined);
  }, [fontFamily]);

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
    api.updateSettings({ cardOpacity: clamped, cardOpacityManualOverride: true }).catch(() => {});
  }, []);

  const resetCardOpacity = useCallback(() => {
    const themeDefault = theme.defaultCardOpacity ?? DEFAULT_OPACITY;
    setCardOpacityState(themeDefault);
    setCardOpacityManualOverrideState(false);
    manualOverrideRef.current = false;
    AsyncStorage.removeItem(KEY_CARD_OPACITY).catch(() => {});
    AsyncStorage.removeItem(KEY_OPACITY_OVERRIDE).catch(() => {});
    api.updateSettings({ cardOpacity: null, cardOpacityManualOverride: false }).catch(() => {});
  }, [theme.defaultCardOpacity]);

  const setCardGlass = useCallback((v: boolean) => {
    setCardGlassState(v);
    AsyncStorage.setItem(KEY_CARD_GLASS, String(v)).catch(() => {});
  }, []);

  return (
    <AppSettingsContext.Provider
      value={{
        shadowsEnabled, fontFamily, fontSizeScale, cardOpacity, cardOpacityManualOverride, cardGlass,
        setShadowsEnabled, setFontFamily, setFontSizeScale, setCardOpacity, resetCardOpacity, setCardGlass,
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
 * Returns the card background color with the current cardOpacity and glass effect applied.
 * Use this everywhere you'd otherwise write `backgroundColor: theme.card`.
 */
export function useCardBg(): string {
  const { cardOpacity, cardGlass } = useAppSettings();
  const { theme } = useTheme();
  const base = cardGlass ? blendWithWhite(theme.card, 0.28) : theme.card;
  const alpha = cardGlass ? cardOpacity * 0.82 : cardOpacity;
  return hexWithAlpha(base, alpha);
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
