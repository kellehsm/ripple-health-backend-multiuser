import type { Theme } from "./theme";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CF = Theme["teal"];
type CFn = Theme["coral"];

function cf(solid: string, sub: string, bg: string, fg: string, tint: string, bar?: string): CF {
  return { solid, sub, bg, fg, tint, bar: bar ?? solid };
}
function cfn(solid: string, sub: string, bg: string, fg: string, tint: string): CFn {
  return { solid, sub, bg, fg, tint };
}

// ─── LIGHT THEMES ─────────────────────────────────────────────────────────────

// 1. Bright Companion — warm cream + OKLCH-based accent hues
const morningMist: Theme = {
  id: "morning-mist", name: "Morning Mist", group: "Light", isDark: false,
  ink: "#1C2B3A", cream: "#FAF5EE", page: "#F5ECDF", gradientEnd: "#EDE5D5", card: "#FEFCF8", cardBorder: "#C4B5A5",
  textStrong: "#1C2B3A", textSoft: "#4E6074",
  primary: "#2870C8", success: "#1A9870", warning: "#B88820", danger: "#C02840",
  glucoseHigh: "#C02840", glucoseLow: "#2870C8",
  teal:   cf("#1A9870", "#0E6848", "#D8F5EB", "#1C2B3A", "#D8F5EB", "#1A9870"),
  coral:  cfn("#C85C28", "#A04018", "#FBEACC", "#1C2B3A", "#FBEACC"),
  blue:   cfn("#2870C8", "#1858A8", "#DAE8FA", "#1C2B3A", "#DAE8FA"),
  amber:  cfn("#B88820", "#906808", "#F8EEC8", "#1C2B3A", "#F8EEC8"),
  purple: cfn("#7830B8", "#581898", "#ECD8FA", "#1C2B3A", "#ECD8FA"),
  berry:  cf("#C02840", "#901828", "#FAE0E4", "#1C2B3A", "#FAE0E4", "#C02840"),
  violet: cfn("#7838B8", "#581898", "#ECD8FA", "#1C2B3A", "#ECD8FA"),
  red:    cfn("#C02840", "#901828", "#FAE0E4", "#1C2B3A", "#FAE0E4"),
  pink:   cfn("#C02840", "#901828", "#FAE0E4", "#1C2B3A", "#FAE0E4"),
  green:  cfn("#1A9870", "#0E6848", "#D8F5EB", "#1C2B3A", "#D8F5EB"),
  brown:  { solid: "#8B5E3C", sub: "#6A4018", tint: "#F5EDE0" },
  cycle:   { period: "#C02840", predicted: "#FAB8C0", mood: "#7838B8", symptom: "#1A9870", fertile: "#2870C8", ovulation: "#B88820" },
  finance: { food: "#C85C28", transport: "#2870C8", shopping: "#7830B8", health: "#1A9870", entertainment: "#C02840", utilities: "#B88820", other: "#5C6D7E" },
};

// 2. Pale sage + botanical greens, terracotta, ochre
const paleSage: Theme = {
  id: "pale-sage", name: "Pale Sage", group: "Light", isDark: false,
  ink: "#1E2C18", cream: "#F2F7F0", page: "#E8EFE5", gradientEnd: "#DDE6D8", card: "#F6FAF4", cardBorder: "#9AB88E",
  textStrong: "#1E2C18", textSoft: "#4A5E40",
  primary: "#4A7A3A", success: "#3A6A2A", warning: "#A07020", danger: "#8B3020",
  glucoseHigh: "#8B3020", glucoseLow: "#4A6A8A",
  teal:   cf("#2E7A28", "#1A5A14", "#BDD5B4", "#1A3A10", "#C8E0BF"),
  coral:  cfn("#B86848", "#985038", "#EDD8C8", "#5A2810", "#F0E0D0"),
  blue:   cfn("#3A6A8A", "#1A4A68", "#C8D8E8", "#0A1A30", "#D2E0EC"),
  amber:  cfn("#8A7030", "#6A5218", "#E5D8A8", "#3A2808", "#EAE0B8"),
  purple: cfn("#6A5890", "#4A3870", "#D8D0EE", "#281848", "#E0D8F2"),
  berry:  cf("#925068", "#723050", "#EDD0DA", "#480E28", "#F0D5E0"),
  violet: cfn("#7858B0", "#5838A0", "#DDD0F0", "#2A1048", "#E5D8F5"),
  red:    cfn("#9B3020", "#7A1808", "#F0CCC0", "#4A0808", "#F5D5C8"),
  pink:   cfn("#925068", "#723050", "#EDD0DA", "#480E28", "#F0D5E0"),
  green:  cfn("#2E7A28", "#1A5A14", "#BDD5B4", "#1A3A10", "#C8E0BF"),
  brown:  { solid: "#7A5838", sub: "#5A3818", tint: "#F0E4D8" },
  cycle:   { period: "#8B3020", predicted: "#F5C8B8", mood: "#6A5890", symptom: "#2E7A28", fertile: "#3A6A8A", ovulation: "#8A7030" },
  finance: { food: "#B86848", transport: "#3A6A8A", shopping: "#6A5890", health: "#2E7A28", entertainment: "#925068", utilities: "#8A7030", other: "#4A5E40" },
};

// 3. Soft blush + warm pastels: copper, tangerine, amber gold, mauve
const blushHour: Theme = {
  id: "blush-hour", name: "Blush Hour", group: "Light", isDark: false,
  ink: "#2A1810", cream: "#FAF4F2", page: "#F5EDE8", gradientEnd: "#EDE3DC", card: "#FFF8F5", cardBorder: "#C4907E",
  textStrong: "#2A1810", textSoft: "#7A5040",
  primary: "#C06040", success: "#5A8848", warning: "#C07820", danger: "#9B2828",
  glucoseHigh: "#9B2828", glucoseLow: "#4A7AA8",
  teal:   cf("#B85E30", "#964018", "#F0D8C0", "#5A2010", "#F5E0C8"),
  coral:  cfn("#D87030", "#B85010", "#FAE0C8", "#5A2208", "#FDE8D0"),
  blue:   cfn("#5870B8", "#385898", "#D5DCEC", "#182040", "#DBE0F2"),
  amber:  cfn("#C09028", "#A07010", "#F5E8B8", "#5A3808", "#FAF0C5"),
  purple: cfn("#8860A8", "#684888", "#EAD8EA", "#401040", "#F0E0F0"),
  berry:  cf("#B03860", "#903050", "#F0C8D5", "#500A20", "#F5D0DC"),
  violet: cfn("#9060C0", "#7040A0", "#EAD8F5", "#3A0E48", "#F0E0F8"),
  red:    cfn("#B03030", "#901818", "#F8D0D0", "#580808", "#FADADA"),
  pink:   cfn("#B03860", "#903050", "#F0C8D5", "#500A20", "#F5D0DC"),
  green:  cfn("#5A8848", "#407030", "#D0E8C8", "#182010", "#D8EDD0"),
  brown:  { solid: "#9A6848", sub: "#784828", tint: "#F5E8DC" },
  cycle:   { period: "#B03030", predicted: "#FAC8C8", mood: "#8860A8", symptom: "#5A8848", fertile: "#5870B8", ovulation: "#C09028" },
  finance: { food: "#D87030", transport: "#5870B8", shopping: "#8860A8", health: "#5A8848", entertainment: "#B03860", utilities: "#C09028", other: "#7A5040" },
};

// 4. Cool ivory + jewel tones: sapphire, ruby rose, amethyst, indigo
const jewelLight: Theme = {
  id: "jewel-light", name: "Jewel Light", group: "Light", isDark: false,
  ink: "#12183A", cream: "#F2F4FA", page: "#EEF0F5", gradientEnd: "#E4E8F2", card: "#FAFBFF", cardBorder: "#A8B4D0",
  textStrong: "#12183A", textSoft: "#485880",
  primary: "#2A5CC8", success: "#1A7A50", warning: "#D46C00", danger: "#C02040",
  glucoseHigh: "#C02040", glucoseLow: "#1A5CB8",
  teal:   cf("#1A5CB8", "#0A3A90", "#C0D4F0", "#001850", "#CCE0F8"),
  coral:  cfn("#C83060", "#A01040", "#F5C8DC", "#580010", "#FAD5E4"),
  blue:   cfn("#1890C8", "#0A6898", "#C0E0F0", "#003850", "#CCE8F5"),
  amber:  cfn("#8040C0", "#6020A0", "#E0C8F5", "#300848", "#E8D0FA"),
  purple: cfn("#6028A0", "#401880", "#DDD0F0", "#200848", "#E5D5F8"),
  berry:  cf("#C02850", "#980830", "#F5C8D5", "#480010", "#FAD0DC"),
  violet: cfn("#6848D0", "#4828B0", "#DDD8F8", "#180850", "#E5E0FA"),
  red:    cfn("#C02040", "#A00020", "#FAD0D8", "#580010", "#FAD5DA"),
  pink:   cfn("#C02850", "#980830", "#F5C8D5", "#480010", "#FAD0DC"),
  green:  cfn("#1A7A50", "#0A5830", "#C0E0D0", "#003818", "#CCE8D8"),
  brown:  { solid: "#7A5840", sub: "#5A3820", tint: "#F0E8E0" },
  cycle:   { period: "#9B2040", predicted: "#F5C0D0", mood: "#6030A8", symptom: "#1A8858", fertile: "#1850A8", ovulation: "#9A7810" },
  finance: { food: "#B85828", transport: "#1850A8", shopping: "#6030A8", health: "#1A8858", entertainment: "#9B2040", utilities: "#9A7810", other: "#485A7A" },
};

// 5. Cool gray + saturated primary accents: teal, burnt orange, strong blue
const cleanSlate: Theme = {
  id: "clean-slate", name: "Clean Slate", group: "Light", isDark: false,
  ink: "#1A1A1A", cream: "#F3F3F3", page: "#EBEBEB", gradientEnd: "#E0E0E0", card: "#F7F7F7", cardBorder: "#A0A0A0",
  textStrong: "#1A1A1A", textSoft: "#555555",
  primary: "#2080E0", success: "#20A040", warning: "#E08000", danger: "#D02020",
  glucoseHigh: "#D02020", glucoseLow: "#2080E0",
  teal:   cf("#007898", "#005878", "#C0E0EA", "#002840", "#CAEBF2"),
  coral:  cfn("#D05020", "#A83010", "#FAD8C8", "#5A1808", "#FDE0D0"),
  blue:   cfn("#1878D8", "#0058B8", "#C0D8F5", "#002060", "#CCE0F8"),
  amber:  cfn("#C08020", "#A06010", "#F5E8C0", "#503808", "#FAF0C8"),
  purple: cfn("#6838B8", "#4818A0", "#E0D0F5", "#280848", "#E8D8FA"),
  berry:  cf("#C01858", "#A00038", "#F5C8D8", "#580018", "#FAD0E0"),
  violet: cfn("#7838B8", "#5818A0", "#E8D0F5", "#2C0848", "#EED8FA"),
  red:    cfn("#D02020", "#B00808", "#FAD0D0", "#5A0808", "#FAD5D5"),
  pink:   cfn("#C01858", "#A00038", "#F5C8D8", "#580018", "#FAD0E0"),
  green:  cfn("#20A040", "#108028", "#C0E8CC", "#083818", "#CCF0D5"),
  brown:  { solid: "#808080", sub: "#606060", tint: "#F0F0F0" },
  cycle:   { period: "#C02840", predicted: "#FAC8D0", mood: "#7838B8", symptom: "#1A9870", fertile: "#2870C8", ovulation: "#B88820" },
  finance: { food: "#C85C28", transport: "#2870C8", shopping: "#7830B8", health: "#1A9870", entertainment: "#C02840", utilities: "#B88820", other: "#5C6D7E" },
};

// ─── DARK THEMES ──────────────────────────────────────────────────────────────

// 6. Obsidian — OLED true-black with jewel-tone accent pops
const obsidian: Theme = {
  id: "obsidian", name: "Obsidian", group: "Dark", isDark: true, defaultCardOpacity: 0.90,
  ink: "#909090", cream: "#1C1C1C", page: "#0B0B0B", gradientEnd: "#1A1A1A", card: "#181818", cardBorder: "#333333",
  textStrong: "#F5F5F5", textSoft: "#888888",
  primary: "#38D090", success: "#38D090", warning: "#E0A030", danger: "#E85050",
  glucoseHigh: "#E85050", glucoseLow: "#5098F0",
  teal:   cf("#38D090", "#20B070", "#0A2018", "#A0FFD0", "#081A12"),  // emerald — steps/activity
  coral:  cfn("#E89840", "#C07820", "#201808", "#FFD0A0", "#181204"), // amber gold — meals
  blue:   cfn("#5098F0", "#3078D0", "#081428", "#A0C8FF", "#060E1C"), // sapphire — water
  amber:  cfn("#E0B030", "#C09010", "#201800", "#FFE880", "#181400"), // gold — sleep
  purple: cfn("#B068F0", "#9048D0", "#180A28", "#E0B8FF", "#100620"), // violet — finance
  berry:  cf("#E84870", "#C02850", "#200810", "#FFB0C8", "#180608"),  // rose — glucose
  violet: cfn("#8888FF", "#6868E0", "#0C0C28", "#C8C8FF", "#08081E"), // indigo — mood
  red:    cfn("#E85050", "#C03030", "#200808", "#FFAAAA", "#180606"),
  pink:   cfn("#E84870", "#C02850", "#200810", "#FFB0C8", "#180608"),
  green:  cfn("#38D090", "#20B070", "#0A2018", "#A0FFD0", "#081A12"),
  brown:  { solid: "#909090", sub: "#707070", tint: "#1A1A1A" },
  cycle:   { period: "#E05070", predicted: "#80304050", mood: "#A870E8", symptom: "#40C898", fertile: "#60A8F0", ovulation: "#E8C040" },
  finance: { food: "#E8804A", transport: "#60A8F0", shopping: "#A870E8", health: "#40C898", entertainment: "#E05070", utilities: "#E8C040", other: "#8090A8" },
};

// 7. Arctic — ice-deep steel blue with crisp frost accents
const arctic: Theme = {
  id: "arctic", name: "Arctic", group: "Dark", isDark: true, defaultCardOpacity: 0.90,
  ink: "#6090B8", cream: "#101C28", page: "#0C1018", gradientEnd: "#182030", card: "#141E2A", cardBorder: "#28405A",
  textStrong: "#E8F4FF", textSoft: "#7898B8",
  primary: "#60C8F8", success: "#40D888", warning: "#F8D050", danger: "#F87870",
  glucoseHigh: "#F87870", glucoseLow: "#40C0F8",
  teal:   cf("#40D8C8", "#28B8A8", "#041E1C", "#90FFEE", "#021612"),  // glacial teal — steps
  coral:  cfn("#F89880", "#D07060", "#201208", "#FFCAB8", "#180C04"), // ice salmon — meals
  blue:   cfn("#60C8F8", "#40A8D8", "#081C30", "#B0E8FF", "#060E20"), // ice blue — water
  amber:  cfn("#F8D050", "#D0A830", "#1E1800", "#FFF0A0", "#161000"), // arctic gold — sleep
  purple: cfn("#9878F8", "#7858D8", "#0E0828", "#D0B8FF", "#080620"), // frost violet — finance
  berry:  cf("#F87898", "#D05878", "#1E0810", "#FFBAD0", "#160608"),  // rose ice — glucose
  violet: cfn("#A898F8", "#8878E0", "#0E0A28", "#D8D0FF", "#080620"), // glacial lavender — mood
  red:    cfn("#F87870", "#D05850", "#200808", "#FFC0B8", "#180606"),
  pink:   cfn("#F87898", "#D05878", "#1E0810", "#FFBAD0", "#160608"),
  green:  cfn("#40D888", "#28B868", "#041C10", "#90FFB8", "#021408"),
  brown:  { solid: "#8090A8", sub: "#607080", tint: "#101820" },
  cycle:   { period: "#F08090", predicted: "#703040", mood: "#C0A0F8", symptom: "#60D8B8", fertile: "#80C0F8", ovulation: "#F0D060" },
  finance: { food: "#F09860", transport: "#80C0F8", shopping: "#C0A0F8", health: "#60D8B8", entertainment: "#F08090", utilities: "#F0D060", other: "#9EB0C8" },
};

// 8. Volcanic — warm coal black with ember and lava accents
const volcanic: Theme = {
  id: "volcanic", name: "Volcanic", group: "Dark", isDark: true, defaultCardOpacity: 0.90,
  ink: "#A08060", cream: "#1C1210", page: "#0E0A08", gradientEnd: "#1E1208", card: "#1C1210", cardBorder: "#3A2218",
  textStrong: "#FFF0E0", textSoft: "#A08070",
  primary: "#F07030", success: "#50C878", warning: "#F0B830", danger: "#F04848",
  glucoseHigh: "#F04848", glucoseLow: "#4090F0",
  teal:   cf("#F08838", "#D06818", "#1E0E04", "#FFD0A0", "#160804"),  // ember orange — steps
  coral:  cfn("#F0A040", "#D08020", "#1E1208", "#FFD8A0", "#160C04"), // molten amber — meals
  blue:   cfn("#5898F0", "#3878D0", "#081628", "#B0D0FF", "#060E1C"), // cool blue — water
  amber:  cfn("#F0C028", "#C09808", "#1C1600", "#FFE880", "#141000"), // fire gold — sleep
  purple: cfn("#C070E0", "#A050C0", "#180A28", "#F0A8FF", "#100618"), // cooled lava violet — finance
  berry:  cf("#F04848", "#D02828", "#200808", "#FFA0A0", "#180606"),  // hot red — glucose
  violet: cfn("#B068D8", "#9048B8", "#160828", "#E0A8FF", "#0E0620"), // ash violet — mood
  red:    cfn("#F04848", "#D02828", "#200808", "#FFAAAA", "#180606"),
  pink:   cfn("#F06880", "#D04860", "#200810", "#FFAAC0", "#180608"),
  green:  cfn("#50C878", "#30A858", "#081A10", "#A0FFCC", "#041208"),
  brown:  { solid: "#C09060", sub: "#A07040", tint: "#1C1008" },
  cycle:   { period: "#F06060", predicted: "#702020", mood: "#C888F0", symptom: "#50C890", fertile: "#7098E8", ovulation: "#F0B840" },
  finance: { food: "#F08050", transport: "#7098E8", shopping: "#C888F0", health: "#50C890", entertainment: "#F06060", utilities: "#F0B840", other: "#908880" },
};

// 9. Abyssal — deep ocean floor with bioluminescent highlights
const abyssal: Theme = {
  id: "abyssal", name: "Abyssal", group: "Dark", isDark: true, defaultCardOpacity: 0.90,
  ink: "#408870", cream: "#0C1C18", page: "#060E0C", gradientEnd: "#0C1E18", card: "#0E1C18", cardBorder: "#1C3828",
  textStrong: "#D8FFE8", textSoft: "#60A888",
  primary: "#00E8C0", success: "#30D870", warning: "#F0C840", danger: "#F06060",
  glucoseHigh: "#F06060", glucoseLow: "#00C0F0",
  teal:   cf("#00F0C8", "#00C8A0", "#001C18", "#A0FFEE", "#001410"),  // bioluminescent cyan — steps
  coral:  cfn("#F08898", "#C06878", "#1E0810", "#FFBACA", "#160608"), // anemone pink — meals
  blue:   cfn("#20C8F8", "#00A8D8", "#021A28", "#90F0FF", "#010E18"), // deep ocean blue — water
  amber:  cfn("#E8C840", "#C0A020", "#1A1600", "#FFF080", "#121000"), // phosphor yellow — sleep
  purple: cfn("#A060E8", "#8040C8", "#100A28", "#D0A8FF", "#0A0620"), // deep sea purple — finance
  berry:  cf("#F07090", "#C85070", "#200810", "#FFB0C8", "#180608"),  // seafloor coral — glucose
  violet: cfn("#8898E8", "#6878C8", "#0A0C28", "#C8D0FF", "#080820"), // bioluminescent blue — mood
  red:    cfn("#F06060", "#D04040", "#200808", "#FFAAAA", "#180606"),
  pink:   cfn("#F07090", "#C85070", "#200810", "#FFB0C8", "#180608"),
  green:  cfn("#30D870", "#18B850", "#041A0C", "#90FFC0", "#021208"),
  brown:  { solid: "#408060", sub: "#306050", tint: "#0A1810" },
  cycle:   { period: "#E87090", predicted: "#60202840", mood: "#B898F8", symptom: "#48D0B0", fertile: "#68B8F8", ovulation: "#F8D058" },
  finance: { food: "#F09868", transport: "#68B8F8", shopping: "#B898F8", health: "#48D0B0", entertainment: "#E87090", utilities: "#F8D058", other: "#788898" },
};

// 10. Nebula — deep space purple-black with cosmic color bursts
const nebula: Theme = {
  id: "nebula", name: "Nebula", group: "Dark", isDark: true, defaultCardOpacity: 0.90,
  ink: "#7878C8", cream: "#0E0E20", page: "#08080E", gradientEnd: "#141428", card: "#10101E", cardBorder: "#28285A",
  textStrong: "#F0EEFF", textSoft: "#9090C0",
  primary: "#A080FF", success: "#40E0A0", warning: "#F0D060", danger: "#FF5878",
  glucoseHigh: "#FF5878", glucoseLow: "#40B0FF",
  teal:   cf("#40E0C0", "#20C0A0", "#041A18", "#A0FFF0", "#021210"),  // cosmic teal — steps
  coral:  cfn("#FF80B0", "#E06090", "#1E0818", "#FFB8D0", "#160610"), // nebula magenta — meals
  blue:   cfn("#60B8FF", "#3898E0", "#081428", "#B8DCFF", "#060E1C"), // stellar blue — water
  amber:  cfn("#F0D060", "#D0B040", "#1C1800", "#FFF0A0", "#141000"), // supernova gold — sleep
  purple: cfn("#C090FF", "#A070E0", "#180830", "#E8C8FF", "#100620"), // cosmic purple — finance
  berry:  cf("#FF5878", "#E03858", "#1E0810", "#FFB0C8", "#160608"),  // stellar red-pink — glucose
  violet: cfn("#D080FF", "#B060E8", "#1A0630", "#F0B8FF", "#100424"), // nebula violet — mood
  red:    cfn("#FF5878", "#E03858", "#1E0810", "#FFB0C8", "#160608"),
  pink:   cfn("#FF80B0", "#E06090", "#1E0818", "#FFB8D0", "#160610"),
  green:  cfn("#40E0A0", "#20C080", "#041A10", "#A0FFD8", "#021208"),
  brown:  { solid: "#9080D0", sub: "#7060B0", tint: "#10101C" },
  cycle:   { period: "#F880A0", predicted: "#601828", mood: "#D0A8FF", symptom: "#58E0C0", fertile: "#80C8FF", ovulation: "#FFD878" },
  finance: { food: "#FFA870", transport: "#80C8FF", shopping: "#D0A8FF", health: "#58E0C0", entertainment: "#F880A0", utilities: "#FFD878", other: "#A0A8C0" },
};

// ─── Theme families ───────────────────────────────────────────────────────────
// Each family pairs one light and one dark palette. The dark-mode toggle
// switches within the family, so users keep their chosen aesthetic.

export type ThemeFamily = {
  id: string;
  name: string;
  /** Short welcoming tagline shown in the Theme Studio. */
  tagline: string;
  light: string;  // palette id
  dark: string;   // palette id
  premium?: boolean;
};

export const THEME_FAMILIES: ThemeFamily[] = [
  { id: "mist",  name: "Morning Mist", tagline: "Warm cream days, jewel-black nights", light: "morning-mist", dark: "obsidian" },
  { id: "sage",  name: "Sage",         tagline: "Botanical greens and deep-sea glow",  light: "pale-sage",    dark: "abyssal"  },
  { id: "blush", name: "Blush",        tagline: "Soft sunset warmth, ember evenings",  light: "blush-hour",   dark: "volcanic" },
  { id: "jewel", name: "Jewel",        tagline: "Bright gemstones and cosmic dust",    light: "jewel-light",  dark: "nebula"   },
  { id: "slate", name: "Slate",        tagline: "Crisp minimalism, arctic frost",      light: "clean-slate",  dark: "arctic"   },
];

export const DEFAULT_FAMILY_ID = "mist";

export function familyForPalette(paletteId: string): ThemeFamily {
  return (
    THEME_FAMILIES.find((f) => f.light === paletteId || f.dark === paletteId) ??
    THEME_FAMILIES[0]
  );
}

// ─── PREMIUM THEMES ───────────────────────────────────────────────────────────

// 11. Cozy Cat — warm cream & marmalade orange with cat illustration icons
const cozyCat: Theme = {
  id: "cozy-cat", name: "Cozy Cat", group: "Premium", isDark: false,
  ink: "#2B2118", cream: "#FDF6EC", page: "#FAF0E0", gradientEnd: "#F3E5CE", card: "#FFFDF8", cardBorder: "#D8C2A4",
  textStrong: "#2B2118", textSoft: "#7A6A55",
  primary: "#D97A2B", success: "#3F9A6E", warning: "#C08A20", danger: "#C24238",
  glucoseHigh: "#C24238", glucoseLow: "#3878B8",
  teal:   cf("#3F9A6E", "#28744F", "#DCF2E6", "#2B2118", "#DCF2E6", "#3F9A6E"),
  coral:  cfn("#D97A2B", "#B25C14", "#FBE8D2", "#2B2118", "#FBE8D2"),
  blue:   cfn("#3878B8", "#245C98", "#DDEAF8", "#2B2118", "#DDEAF8"),
  amber:  cfn("#C08A20", "#986808", "#F8ECC8", "#2B2118", "#F8ECC8"),
  purple: cfn("#8A55B8", "#6B3A98", "#EEDFF8", "#2B2118", "#EEDFF8"),
  berry:  cf("#B84860", "#943048", "#F8DEE4", "#2B2118", "#F8DEE4", "#B84860"),
  violet: cfn("#9560C0", "#7545A0", "#EEDFF8", "#2B2118", "#EEDFF8"),
  red:    cfn("#C24238", "#9E2C24", "#F8DEDA", "#2B2118", "#F8DEDA"),
  pink:   cfn("#B84860", "#943048", "#F8DEE4", "#2B2118", "#F8DEE4"),
  green:  cfn("#3F9A6E", "#28744F", "#DCF2E6", "#2B2118", "#DCF2E6"),
  brown:  { solid: "#8B5E3C", sub: "#6A4018", tint: "#F5EADC" },
  cycle:   { period: "#C24238", predicted: "#F8C4BE", mood: "#9560C0", symptom: "#3F9A6E", fertile: "#3878B8", ovulation: "#C08A20" },
  finance: { food: "#D97A2B", transport: "#3878B8", shopping: "#8A55B8", health: "#3F9A6E", entertainment: "#B84860", utilities: "#C08A20", other: "#7A6A55" },
  iconOverrides: {
    "greeting.morning":   { type: "image", source: require("../../assets/themes/cat/greeting_morning.png") },
    "greeting.afternoon": { type: "image", source: require("../../assets/themes/cat/greeting_afternoon.png") },
    "greeting.evening":   { type: "image", source: require("../../assets/themes/cat/greeting_evening.png") },
    "mealType.breakfast": { type: "image", source: require("../../assets/themes/cat/meal_breakfast.png") },
    "mealType.lunch":     { type: "image", source: require("../../assets/themes/cat/meal_lunch.png") },
    "mealType.dinner":    { type: "image", source: require("../../assets/themes/cat/meal_dinner.png") },
    "mealType.snack":     { type: "image", source: require("../../assets/themes/cat/snack.png") },
    "tab.home":           { type: "image", source: require("../../assets/themes/cat/tab_home.png") },
    "screen.mindfulness": { type: "image", source: require("../../assets/themes/cat/screen_mindfulness.png") },
    "tab.hobbies":    { type: "image", source: require("../../assets/themes/cat/hobbies.png") },
  },
};

// Stamp family ids onto the palettes
morningMist.family = "mist";  obsidian.family = "mist";
paleSage.family    = "sage";  abyssal.family  = "sage";
blushHour.family   = "blush"; volcanic.family = "blush";
jewelLight.family  = "jewel"; nebula.family   = "jewel";
cleanSlate.family  = "slate"; arctic.family   = "slate";

// ─── Exports ──────────────────────────────────────────────────────────────────

export const PALETTES: Record<string, Theme> = {
  "morning-mist": morningMist,
  "pale-sage":    paleSage,
  "blush-hour":   blushHour,
  "jewel-light":  jewelLight,
  "clean-slate":  cleanSlate,
  "obsidian":     obsidian,
  "arctic":       arctic,
  "volcanic":     volcanic,
  "abyssal":      abyssal,
  "nebula":       nebula,
  "cozy-cat":     cozyCat,
};

export const PALETTE_GROUPS: Record<string, string[]> = {
  "Light Themes": ["morning-mist", "pale-sage", "blush-hour", "jewel-light", "clean-slate"],
  "Dark Themes":  ["obsidian", "arctic", "volcanic", "abyssal", "nebula"],
  "Premium":      ["cozy-cat"],
};

export const DEFAULT_PALETTE_ID = "morning-mist";

export const lightTheme = morningMist;
export const darkTheme = obsidian;
