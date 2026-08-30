import { Theme } from "../theme/theme";

/**
 * Deterministically maps a string seed (e.g. user_id or email) to a
 * background/foreground color pair drawn from the active theme palette.
 * Identical in all four screens that previously duplicated this function:
 * ChallengesScreen, FriendsScreen, LifeScreen, ExerciseScreen.
 */
export function avatarColor(seed: string, theme: Theme): { bg: string; fg: string } {
  const palettes = [
    { bg: theme.teal?.tint ?? "#E0F7FA", fg: theme.teal?.fg ?? "#00695C" },
    { bg: theme.purple?.tint ?? "#EDE7F6", fg: theme.purple?.fg ?? "#512DA8" },
    { bg: theme.coral?.tint ?? "#FBE9E7", fg: theme.coral?.fg ?? "#BF360C" },
    { bg: theme.amber?.tint ?? "#FFF8E1", fg: theme.amber?.fg ?? "#E65100" },
    { bg: theme.blue?.tint ?? "#E3F2FD", fg: theme.blue?.fg ?? "#1565C0" },
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palettes[h % palettes.length];
}
