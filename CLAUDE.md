# Ripple Wellness — Frontend PRODUCTION (CLAUDE.md)

Expo/React Native (TypeScript) app, "Ripple Wellness." Talks to the production backend at `https://app.kels.gg/api`.

**THIS IS PRODUCTION. Do not develop here — use `/root/wellness-fresh-multiuser-dev` (dev branch) for all new work.**

## Environment

| | Production (this directory) | Dev |
|---|---|---|
| Directory | `/root/wellness-fresh-multiuser` | `/root/wellness-fresh-multiuser-dev` |
| Git branch | `master` | `dev` |
| Backend URL | `https://app.kels.gg/api` | `http://129.121.125.214:4002` |
| Metro port | 8081 | 8082 |
| Test via | EAS APK | Expo Go |

## Critical operational rules

- **Do NOT run `eas build` without explicit user approval.** EAS build credits are limited — batch ALL native-touching changes (native modules, permissions, icon assets, Health Connect, foreground services, notification config) together and only build when explicitly told to.
- JS-only changes (screens, styling, navigation logic, API calls) need no approval — but develop and test them in the dev directory first.
- Android blocks cleartext HTTP in production builds — the app must use `https://` for production. Expo Go allows cleartext, which is why dev can use `http://`.

## App identity

- Name: **Ripple Wellness**
- Icon: four-quadrant droplet, thin black outline (`#111111`), black pulse/heartbeat line through center, centered, on cream background (`#FBFAF7`)
- Current quadrant colors: teal `#3FA0A6` (top-left), coral `#E8654E` (top-right), purple `#7B3FBF` (bottom-left), berry-wine `#A62A50` (bottom-right) — chosen specifically to avoid resembling Google Health's palette; don't drift back toward teal/blue/green-dominant schemes.

## Theme / metric color mapping (current)

- **Steps** (+ reading/hobbies as "activity") → teal `#3FA0A6`
- **Food/Meals** → coral `#E8654E`
- **Finance** → purple `#7B3FBF`
- **Glucose & heart rate** (default/in-range) → berry-wine `#A62A50` — BUT high/low glucose ALERTS must shift to a distinct urgent red (e.g. `#C0392B`) so alerts visually stand out from the normal berry tone
- **Mood** → a lighter violet, distinct from finance's purple
- **Water** → a complementary blue
- **Sleep** → a muted indigo/lavender
- Cream page background: `#F5F1E8` (slightly deeper than the original `#FBFAF7`)

## Navigation

- Bottom nav order: **Health, Meals, Home (raised center button), Life, Finance** — Home is a filled circle (teal) floating above the tab bar line, not a flat tab like the others. Thin dividers between each tab item.
- Settings is accessed via a header gear icon (stack navigation pushed on top), NOT a 6th bottom tab — deliberate choice to preserve the 5-tab-plus-center-button layout.

## Icon library gotchas

- The actual app uses **Ionicons** via `@expo/vector-icons`. (Note: Tabler icon names like `ti-pizza`/`ti-heartbeat` were used in chat-based design mockups only and do NOT apply to this codebase — always verify Ionicons names actually render in Expo Go before finalizing.)
- Health → `heart`, Meals → `restaurant` or `fast-food` (verify which renders best), Home → `home`, Life → `book`, Finance → `wallet`.

## Common bug pattern to check first

Multiple "this feature doesn't work" reports this project turned out to be **working backend logic with no UI ever displaying the result** (book progress, hobby logging, water tracking). Before rewriting a log/save function, check whether the data is actually landing in the database — if it is, the fix is a display/UI wiring issue, not the underlying logic.

## Settings permission checks

Any screen showing system permission status (notifications, battery optimization, Health Connect) MUST re-check the ACTUAL current system state on screen focus (`useFocusEffect`), not just on mount — the user often leaves to Android's own settings screens and returns, and a mount-only check will show stale/wrong status.

## Correlation / pattern language (UI copy)

Any UI text describing a pattern across data must stay descriptive, never diagnostic:
- Single day → gentle observation ("glucose climbed after lunch today")
- Repeated pattern across multiple days → stronger language OK, but must cite the count ("4 of the last 5 days")
- Never phrase things as medical advice or a causal claim ("your lunch is spiking your blood sugar" is NOT acceptable phrasing)

## Receiving promoted changes from dev

After dev changes are confirmed working and merged into master:

```bash
# In this directory:
git pull origin master
# Then trigger an EAS build only with explicit user approval if native changes are included
```

## Git

- Repo under git. Commit checkpoints after each confirmed-working feature.
- Don't regenerate shared files (`client.ts`, theme files) wholesale when adding a new feature — add to them.
