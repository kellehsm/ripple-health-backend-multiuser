// Color tokens match the approved dashboard mockup exactly.
// Each metric type keeps ONE color everywhere in the app - don't
// improvise new colors per-screen, add a new ramp here instead.

export const lightTheme = {
  page: "#F5F1E8",
  card: "#ffffff",
  cardBorder: "#e7e3d8",
  textStrong: "#2C2C2A",
  textSoft: "#6b6a63",

  teal: { bg: "#B9E9D6", fg: "#085041", sub: "#0F6E56", bar: "#149D74" },
  blue: { bg: "#B9DBF7", fg: "#0C447C", sub: "#185FA5" },
  amber: { bg: "#F5D89A", fg: "#633806", sub: "#8A5A0C" },
  coral: { bg: "#F3C2AC", fg: "#712B13", sub: "#A5401F" },
  pink: { bg: "#F2BBD1", fg: "#72243E", sub: "#993556" },
  green: { bg: "#C5E29A", fg: "#27500A", sub: "#3B6D11" },
  red: { bg: "#F7C1C1", fg: "#791F1F", sub: "#A32D2D" },
  brown: { sub: "#6F4518" },
};

export const darkTheme = {
  page: "#211F1B",
  card: "#2A2824",
  cardBorder: "#3a372f",
  textStrong: "#F2F0EA",
  textSoft: "#B4B1A8",

  teal: { bg: "#0B4A38", fg: "#8FE0C3", sub: "#6FCBA9", bar: "#2FBE8E" },
  blue: { bg: "#0E3A63", fg: "#9BCBF2", sub: "#7BB6E8" },
  amber: { bg: "#5C4108", fg: "#F2CB80", sub: "#E0B563" },
  coral: { bg: "#5C2A16", fg: "#F0AE8E", sub: "#E38F68" },
  pink: { bg: "#5C1F38", fg: "#F0A8C4", sub: "#E389AC" },
  green: { bg: "#2E4A12", fg: "#B9E88A", sub: "#9DD866" },
  red: { bg: "#5C1616", fg: "#F0A8A8", sub: "#E38181" },
  brown: { sub: "#B8834A" },
};

export type Theme = typeof lightTheme;
