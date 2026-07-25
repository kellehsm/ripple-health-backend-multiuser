// Color tokens match the approved dashboard mockup exactly.
// Each metric type keeps ONE color everywhere in the app - don't
// improvise new colors per-screen, add a new ramp here instead.

export type LoadingVariant = "ripple" | "pulse";

export type BgPreset = {
  id: string;
  label: string;
  // light mode backgrounds
  page: string;
  card: string;
  surface: string;
  cardBorder: string;
  // dark mode backgrounds
  pageDark: string;
  cardDark: string;
  surfaceDark: string;
  cardBorderDark: string;
  premium?: boolean;
  loadingVariant: LoadingVariant;
};

export const BG_PRESETS: BgPreset[] = [
  {
    id: "warm",
    label: "Warm",
    page: "#F5F1E8", card: "#ffffff", surface: "#FAF7F1", cardBorder: "#e7e3d8",
    pageDark: "#211F1B", cardDark: "#2A2824", surfaceDark: "#1E1C18", cardBorderDark: "#3a372f",
    loadingVariant: "ripple",
  },
  {
    id: "cream",
    label: "Cream",
    page: "#EDE8DC", card: "#FDFAF5", surface: "#F5F0E8", cardBorder: "#DED8C8",
    pageDark: "#1E1C17", cardDark: "#2C2920", surfaceDark: "#19180F", cardBorderDark: "#3C3830",
    loadingVariant: "ripple",
  },
  {
    id: "white",
    label: "White",
    page: "#F4F4F4", card: "#ffffff", surface: "#EEEEEE", cardBorder: "#E0E0E0",
    pageDark: "#1A1A1A", cardDark: "#262626", surfaceDark: "#161616", cardBorderDark: "#363636",
    loadingVariant: "ripple",
  },
  {
    id: "ocean",
    label: "Ocean",
    page: "#EEF2F7", card: "#FFFFFF", surface: "#E6EEF8", cardBorder: "#D4E0ED",
    pageDark: "#151D27", cardDark: "#1E2A38", surfaceDark: "#111821", cardBorderDark: "#2A3A4E",
    premium: true,
    loadingVariant: "pulse",
  },
  {
    id: "forest",
    label: "Forest",
    page: "#EDF2ED", card: "#FFFFFF", surface: "#E3ECE3", cardBorder: "#CEDFCE",
    pageDark: "#151C15", cardDark: "#1E281E", surfaceDark: "#111811", cardBorderDark: "#2A3C2A",
    premium: true,
    loadingVariant: "pulse",
  },
];

export const DEFAULT_PRESET = BG_PRESETS[0];

function buildTheme(preset: BgPreset, dark: boolean) {
  return {
    page:       dark ? preset.pageDark       : preset.page,
    card:       dark ? preset.cardDark       : preset.card,
    surface:    dark ? preset.surfaceDark    : preset.surface,
    cardBorder: dark ? preset.cardBorderDark : preset.cardBorder,
    textStrong: dark ? "#F2F0EA" : "#2C2C2A",
    textSoft:   dark ? "#B4B1A8" : "#6b6a63",

    teal:  dark ? { bg: "#0B4A38", fg: "#8FE0C3", sub: "#6FCBA9", bar: "#2FBE8E" }
                : { bg: "#B9E9D6", fg: "#085041", sub: "#0F6E56", bar: "#149D74" },
    blue:  dark ? { bg: "#0E3A63", fg: "#9BCBF2", sub: "#7BB6E8" }
                : { bg: "#B9DBF7", fg: "#0C447C", sub: "#185FA5" },
    amber: dark ? { bg: "#5C4108", fg: "#F2CB80", sub: "#E0B563" }
                : { bg: "#F5D89A", fg: "#633806", sub: "#8A5A0C" },
    coral: dark ? { bg: "#5C2A16", fg: "#F0AE8E", sub: "#E38F68" }
                : { bg: "#F3C2AC", fg: "#712B13", sub: "#A5401F" },
    pink:  dark ? { bg: "#5C1F38", fg: "#F0A8C4", sub: "#E389AC" }
                : { bg: "#F2BBD1", fg: "#72243E", sub: "#993556" },
    green: dark ? { bg: "#2E4A12", fg: "#B9E88A", sub: "#9DD866" }
                : { bg: "#C5E29A", fg: "#27500A", sub: "#3B6D11" },
    red:   dark ? { bg: "#5C1616", fg: "#F0A8A8", sub: "#E38181" }
                : { bg: "#F7C1C1", fg: "#791F1F", sub: "#A32D2D" },
    brown: dark ? { sub: "#B8834A" } : { sub: "#6F4518" },
  };
}

export const lightTheme = buildTheme(DEFAULT_PRESET, false);
export const darkTheme  = buildTheme(DEFAULT_PRESET, true);

export type Theme = ReturnType<typeof buildTheme>;
export { buildTheme };
