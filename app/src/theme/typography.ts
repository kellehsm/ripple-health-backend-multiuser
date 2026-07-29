/**
 * typography.ts — font family strings for Ripple Wellness.
 *
 * `fonts` uses property getters so that when the user's font family setting
 * changes, any component that reads `fonts.bold` etc. during a re-render will
 * automatically get the updated value. Module-level StyleSheet.create calls
 * will use the value at mount time (updated on next remount after setting change).
 */

let _override: string | undefined;

/**
 * Called by AppSettingsProvider when the fontFamily setting changes.
 * `ff` is undefined for System (Nunito), or a CSS generic like "serif" / "monospace".
 */
export function setFontFamilyOverride(ff: string | undefined): void {
  _override = ff;
}

export const fonts = {
  get regular()   { return _override ?? "Nunito_400Regular"; },
  get medium()    { return _override ?? "Nunito_500Medium"; },
  get semiBold()  { return _override ?? "Nunito_600SemiBold"; },
  get bold()      { return _override ?? "Nunito_700Bold"; },
  get extraBold() { return _override ?? "Nunito_800ExtraBold"; },
};
