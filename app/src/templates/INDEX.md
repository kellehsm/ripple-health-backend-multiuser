# Screen Design Templates

One template per screen archetype. Copy the relevant file as a starting point
for any new screen — don't build from scratch.

---

## Template index

| File | Archetype | Screens it covers |
|---|---|---|
| `AuthScreen.template.tsx` | Auth / Onboarding | Login, SignUp, OnboardingFlow, FriendsOnboarding |
| `DashboardScreen.template.tsx` | Dashboard / Home | Overview (Home tab), CustomizeDashboard |
| `DomainScreen.template.tsx` | Tab domain screen | Health, Life, Meals, Finance, MedCycle |
| `DetailScreen.template.tsx` | Drill-down detail | ExerciseDetail, HeartRateDetail, StepsDetail, ChallengeDetail, MedicationHistory |
| `ListScreen.template.tsx` | Searchable list | ChallengesScreen, HistoryScreen, LeaderboardScreen, InsightsTrends, GlobalSearch |
| `SettingsListScreen.template.tsx` | Settings nav menu | SettingsScreen, TabPreferences |
| `SettingsDetailScreen.template.tsx` | Settings config | All settings/* screens (Appearance, Notifications, Integrations, etc.) |
| `WizardScreen.template.tsx` | Multi-step wizard | WorkoutSetupWizard, ExerciseSession, NewChallenge, OnboardingFlow steps |
| `AnalyticsScreen.template.tsx` | Charts / insights | InsightsScreen, TrendsScreen, ExperimentScreen, InsightsTrends |
| `ModalSheet.template.tsx` | Bottom sheet / modal | ThemePickerModal, DashboardEditorModal, MoodCheckInModal, LongPressActionMenu |
| `EmptyStateScreen.template.tsx` | Empty / placeholder | CompletedScreen, MindfulnessScreen, any "coming soon" or "no data yet" state |
| `ConditionalFeatureScreen.template.tsx` | Feature-flag content | MedCycleScreen, HealthTabScreen (med/cycle/symptoms tiles) |

---

## Design rules (apply to every screen)

### Color
- Use **theme tokens only** — never hardcode hex except for the `PURPLE = "#9B59B6"` med/cycle constant.
- Each metric type owns exactly **one colorKey**: steps→teal, food→coral, finance→purple (dev app), glucose→red, mood→pink, water→blue, sleep→amber.
- Light/dark handled automatically by `useTheme()` — never branch on `mode` inside a screen.

### Typography
- Always import `fonts` from `../theme/typography`.
- Headlines: `fonts.bold` (700) · Section titles: `fonts.semiBold` (600) · Body: `fonts.regular` (400) · Values/labels: `fonts.medium` (500)
- Never use `fontWeight` without a matching `fontFamily`.

### Cards
Every card gets the standard shadow block:
```ts
shadowColor: "#000",
shadowOffset: { width: 0, height: 2 },
shadowOpacity: 0.08,
shadowRadius: 6,
elevation: 3,
```

### Scroll padding
- Tab screens: `paddingBottom: 32` minimum in `contentContainerStyle`.
- Screens with FeatureTour: add `tourPadding` state + `onExtraPadding` prop (see FeatureTour.tsx).
- Screens with FAB: `paddingBottom: 96` so content isn't hidden behind the button.

### Empty states
- Use `EmptyStateScreenTemplate` (full screen) or `InlineEmptyState` (inside a card).
- Never show a blank card — always show an icon + copy + optional CTA.

### Language rules
- **Never** phrase patterns as medical advice or causal claims.
- Single-day observation: gentle language ("glucose climbed after lunch today").
- Repeated pattern: cite the count ("4 of the last 5 days").

---

## How to use a template

1. Copy the `.template.tsx` file and rename it (remove `.template`).
2. Move it to `src/screens/` or `src/screens/settings/`.
3. Replace placeholder text, icons, and colorKeys with real values.
4. Wire up real data — replace `SAMPLE_ITEMS` / placeholder views with API calls.
5. Add the screen to `navigation/types.ts` and `navigation/RootStack.tsx`.
