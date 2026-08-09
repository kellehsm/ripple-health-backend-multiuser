/**
 * Global font application.
 *
 * Almost no screen passes fontFamily explicitly, so the user's font choice
 * has to be applied at the Text/TextInput level. This patches Text.render
 * (the long-standing RN technique) to prepend the resolved family for the
 * current setting, honoring each style's fontWeight with a true drawn weight
 * (Nunito ships one file per weight — synthetic bold looks muddy).
 *
 * Styles that explicitly set their own fontFamily are left untouched.
 */
import React from "react";
import { Text, TextInput, StyleSheet, TextStyle } from "react-native";
import {
  type FontFamilyKey,
  DEFAULT_FONT_FAMILY,
  resolveFontForWeight,
} from "./fontSystem";

let currentFamily: FontFamilyKey = DEFAULT_FONT_FAMILY;

/** Called by AppSettingsProvider whenever the font setting changes. */
export function setGlobalFontFamily(key: FontFamilyKey) {
  currentFamily = key;
}

function injectFont(origin: React.ReactElement<{ style?: any }>) {
  if (currentFamily === "System") return origin;
  const flat = (StyleSheet.flatten(origin.props.style) ?? {}) as TextStyle;
  if (flat.fontFamily) return origin; // explicit family — respect it
  const family = resolveFontForWeight(currentFamily, flat.fontWeight as any);
  if (!family) return origin;
  // fontWeight must be dropped when the weight is baked into the file,
  // otherwise Android re-synthesizes bold on top of the bold file.
  const patch: TextStyle =
    currentFamily === "Nunito"
      ? { fontFamily: family, fontWeight: "normal" }
      : { fontFamily: family };
  return React.cloneElement(origin, {
    style: [origin.props.style, patch],
  } as any);
}

let applied = false;

/** Install the render patch once, at module import / app start. */
export function applyGlobalFontPatch() {
  if (applied) return;
  applied = true;
  for (const Component of [Text, TextInput] as any[]) {
    const original = Component.render;
    if (typeof original !== "function") continue;
    Component.render = function (...args: any[]) {
      const origin = original.apply(this, args);
      if (!origin) return origin;
      return injectFont(origin);
    };
  }
}
