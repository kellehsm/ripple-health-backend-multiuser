# Ripple Wellness — Feature Ideas

---

## Health Intelligence

- **Glucose prediction** — after a meal is logged, estimate where glucose will be in 90 min based on past patterns for that food type
- **Sleep debt counter** — running tally of hours owed vs. baseline, shown prominently on the Health tab
- **Post-workout glucose window** — flag the 2hr window after exercise where glucose typically dips; show it on the chart as a shaded zone
- **Medication adherence %** — for each med, show a 30-day compliance bar next to the name
- **Heart rate zones** — during workouts, classify time spent in rest/fat-burn/cardio/peak zones and show a breakdown post-session
- **Resting HR trend** — 30-day resting HR chart in the Health tab; flag meaningful drops (fitness improving) or spikes (illness/overtraining)
- **Recovery score** — composite of sleep quality, resting HR, and yesterday's activity level; shown on Home each morning
- **Glucose variability index** — beyond average: show coefficient of variation so users understand consistency, not just level
- **Menstrual cycle phase overlays** — overlay cycle phase on glucose and mood charts to surface hormonal correlations
- **Stress proxy** — HRV estimated from resting HR trends; shown as a simple low/med/high indicator
- **Hydration reminders tied to activity** — if steps are high that day, increase water goal dynamically
- **Symptom journal** — quick-log symptoms (headache, fatigue, bloating) and surface correlations with food/glucose/sleep in Trends

## Meals

- **Quick-log from history** — "You had this on Tuesday — log it again?" one-tap repeat
- **Glucose response tagging** — after eating, let user mark how they felt (spike, flat, crash); builds a personal food-response library over time
- **Fasting timer** — start/stop with a widget button; shows current fast length on Home and sends a milestone notification at 12h/16h/24h
- **Meal photo log** — attach a photo to a meal entry; gallery view in history
- **Net carb toggle** — show net carbs (total carbs minus fiber) as an alternative to total carbs for low-carb users
- **Restaurant mode** — scan a restaurant's QR menu or search by restaurant name; pre-populate common dishes
- **Alcohol tracker** — standard drink count with a weekly limit warning (already have the section; add a limit + running total)
- **Pre-meal glucose alert** — notify if glucose is already elevated before a high-carb meal is logged
- **Calorie goal with macro split** — set a daily calorie target broken into protein/carb/fat %; show progress ring on Meals tab
- **Weekly nutrition report** — average macros per day across the week, flagging days significantly over/under

## Finance

- **Spending forecast** — "At this rate you'll spend $X by end of month" shown inline on the budget card
- **Category rollover** — unspent from one week carries to the next instead of resetting
- **Impulse guard** — flag transactions logged outside usual hours or that exceed a per-transaction threshold; prompts a pause before confirming
- **Savings goal tracker** — set a target amount and deadline; show a progress bar and weekly "on track / behind" status
- **Subscription detector** — identify recurring charges and list them in a Subscriptions card
- **Spend-mood correlation** — surface whether the user tends to spend more on low-mood days (already have mood data)
- **Cash envelope mode** — set per-category spending limits that lock once hit; good for discretionary categories
- **Net worth snapshot** — manually enter assets and liabilities; show a simple net worth number that updates monthly

## Life / Habits

- **Habit stacking** — link habits so completing one prompts the next ("You finished your workout — log water?")
- **Book reading sessions** — log start/end time per session; show pages-per-hour and projected finish date
- **Streak freezes** — one per week, planned day-off that doesn't break a streak
- **Hobby time log** — beyond just logging an activity, track duration; show weekly hours-per-hobby in Life tab
- **Annual reading goal** — set a books-per-year target with a progress bar and pace indicator ("on track to finish 18 books")
- **Habit heatmap** — GitHub-style contribution grid for any habit, showing consistency over the past 12 weeks
- **Gratitude log** — one line per day, stored privately; optional weekly reminder; searchable
- **Life areas balance wheel** — radar chart scoring Health / Finance / Learning / Social / Mindfulness based on recent activity

## Social / Gamification

- **Shared challenges with stakes** — user-defined commitment for the loser (just displayed in-app; honor system)
- **Anonymous leaderboard mode** — show rank without revealing name to pending friend requests
- **Group challenges** — 3+ friends competing on the same metric over a set period
- **Kudos system** — send a quick reaction (fire, clap, star) to a friend's streak milestone
- **Friend activity feed** — opt-in feed showing friends' recent streak achievements and challenge completions
- **Rival mode** — pick one friend as your rival; show their stats next to yours on the Home screen
- **Team challenges** — two teams of friends compete on aggregate step count for a week

## Notifications / Smart Alerts

- **Bedtime nudge** — based on user's target sleep duration and usual wake time, suggest when to start winding down
- **Glucose cliff warning** — if glucose drops fast (based on Dexcom trend arrow), notify before it hits a low threshold
- **Weekly pattern digest** (already building) — Sunday evening push: "Here's how this week compared to your best week"
- **Finance payday reminder** — on pay day, prompt to log any incoming transactions and review budget allocations
- **Medication window** — for PRN meds, surface a "last taken X hours ago" reminder if near the safe re-dose window
- **Low streak danger** — if the user hasn't logged anything by 9pm and has a streak at risk, send a gentle nudge
- **Post-meal check-in** — 90 min after a meal is logged, prompt to log how they feel (energy, fullness, glucose if no Dexcom)

## UX / Polish

- **Natural language weekly recap** — "This week your glucose was 12% more stable than last week. Best day: Wednesday." One paragraph, Home tab
- **Custom metrics** — user-defined trackable (e.g., "coffees", "headache 1–10") with a simple number log; shows up in Trends
- **Home screen 4×2 widget** — glucose + steps + mood + streak all at once
- **Siri/Google Assistant shortcuts** — "log water", "what's my glucose", "start a fast"
- **Dark mode OLED theme** — true black backgrounds for OLED screens
- **Compact mode** — for power users who want more data density and fewer large hero numbers
- **Export to PDF health summary** — one-page monthly summary suitable for sharing with a doctor (glucose, sleep, activity, mood)
- **Data import wizard** — import historical data from Apple Health, Google Fit, Cronometer, MyFitnessPal CSV
- **Quick-add floating button** — context-aware: on Meals tab it opens food search; on Life tab it opens hobby/book quick-add; on Home it opens mood picker
- **Accessibility: larger text mode** — scale up all type and touch targets for low-vision users
- **Search across everything** — unified search that returns meals, journal entries, book titles, transactions, and metric readings
- **Pinned insights** — let users bookmark an insight card so it always shows on Home until dismissed

## Integrations

- **Oura Ring** — import sleep stages, HRV, readiness score
- **Garmin / Fitbit** — alternative to Health Connect for devices that don't support it
- **Cronometer CSV import** — pull in historical nutrition data
- **YNAB sync** — two-way sync spending categories with You Need A Budget
- **Strava** — import workouts automatically; surface in the Exercise screen
- **Apple Watch / WearOS complication** — show current glucose or step count directly on the watch face

## Monetization / Growth

- **Premium tier** — unlock Trends history beyond 30 days, advanced correlations, PDF exports, and custom metrics
- **Referral program** — share a code; both users get a streak freeze or premium week
- **Coach mode** — allow a trusted person (dietitian, trainer, accountability partner) to view a read-only dashboard of your stats
- **Anonymous data contribution** — opt-in to share anonymized glucose/meal data to improve community insights; show aggregate stats back ("people who eat X tend to see Y")
