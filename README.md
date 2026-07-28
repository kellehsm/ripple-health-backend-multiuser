<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=14&height=200&section=header&text=Ripple%20Wellness&fontColor=FFFFFF&fontSize=56&fontAlignY=38&desc=Personal%20health%20OS%20for%20Android&descSize=18&descAlignY=60" width="100%" />

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](.)
[![React Native](https://img.shields.io/badge/React_Native-61DAFB?style=flat-square&logo=react&logoColor=black)](.)
[![Expo](https://img.shields.io/badge/Expo_SDK_57-000020?style=flat-square&logo=expo&logoColor=white)](.)
[![Android](https://img.shields.io/badge/Android-3DDC84?style=flat-square&logo=android&logoColor=white)](.)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](.)
[![Self-hosted](https://img.shields.io/badge/Self--hosted-FF6B35?style=flat-square&logo=homeassistant&logoColor=white)](.)

</div>

## What it is

Ripple Wellness is a **personal wellness app** — not a step counter, not a calorie tracker, not a mood diary. All of those, integrated, with the data you actually want to see. It pulls together a Dexcom continuous glucose monitor, nutrition database lookups, mood journaling, Health Connect data (steps, sleep, heart rate), and spending tracking into a single Android app backed by a self-hosted PostgreSQL server.

**Why self-hosted:** your glucose readings, meal logs, and mood history are sensitive. They don't belong in a startup's cloud. Everything runs on a VPS you control.

---

## Features

### Glucose
- Real-time Dexcom CGM integration via Dexcom Share API
- Live glucose value with trend arrow and rate-of-change delta
- Configurable time-range chart (3h / 6h / 12h / 24h) with 70–180 mg/dL target band
- Yesterday overlay for same-window comparison
- High/low alerts with dedicated notification channel
- Glucose response mini-chart per logged meal (15 min pre → 3 hr post window)

### Nutrition & Meals
- Food search backed by USDA FoodData Central + Open Food Facts
- Barcode scanner for packaged foods
- Manual macro entry (name, carbs, sugar, calories)
- Per-meal glucose response chart showing post-meal spikes
- Daily macro totals (carbs, sugar, calories)
- **Frequent meals** — top 8 most-logged meals surfaced as one-tap shortcuts
- Smart notification auto-cancels when meal is logged

### Mood & Journal
- Time-of-day check-ins (morning / afternoon / evening / night) with named moods (Bad → Great)
- Off-schedule "moment" logs with optional free-text note
- Chronological event feed overlaid on glucose chart

### Activity & Health
- **Steps** via Health Connect with 7-day and month-over-month breakdown
- **Sleep** duration tracking via Health Connect
- **Water** intake with configurable daily goal and one-tap logging
- **Heart rate** chart with resting and peak values
- Android home screen widget showing live glucose + today's steps (refreshes every 30 min, tap to force refresh)
- App shortcuts (long-press icon) for instant meal or water logging

### Life & Finance
- **Books** — search, add, and log reading progress with percentage completion
- **Hobbies** — custom activities with time or unit tracking and week-over-week stats
- **Spending** — manual entry with categories; tracked week-to-week

### Trends & Insights
- Pearson correlation scatter plots across a 14d / 30d / 60d window
- Sleep ↔ Mood · Spending ↔ Mood · Glucose ↔ Mood · Sleep ↔ Glucose
- Linear regression trend line per chart
- Descriptive insight text (never diagnostic, never causal)

### Smart Notifications
- **Meal reminders** — configurable per-meal-period with auto-cancel on logging
- **Glucose spike prompt** — fires when glucose rises 30+ mg/dL in an hour
- **Evening check-in** — end-of-day summary nudge
- **Water reminder** — every 2 hours until daily goal is hit
- **Streak protection** — warns before midnight if you haven't logged anything
- Separate notification channels for each type (independently silenceable)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Android App (RN/Expo)                 │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │  Tab Screens │  │  Foreground  │  │ Home Screen   │ │
│  │  (5 tabs +   │  │  Service     │  │ Widget        │ │
│  │   modals)    │  │  (Notifee)   │  │ (Kotlin)      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘ │
│         └─────────────────┴─────────────────┘          │
│                           │ HTTPS                        │
└───────────────────────────┼─────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │   VPS  ·  Caddy (HTTPS)    │
              │   Fastify REST API :4000    │
              │   Node.js · TypeScript      │
              └─────────────┬──────────────┘
                            │
              ┌─────────────▼──────────────┐
              │       PostgreSQL            │
              │  glucose · meals · journal  │
              │  books · hobbies · spending │
              │  health metrics · settings  │
              └────────────────────────────┘
                            │
              ┌─────────────▼──────────────┐
              │       External APIs         │
              │  Dexcom Share               │
              │  USDA FoodData Central      │
              │  Open Food Facts            │
              │  Health Connect (on-device) │
              └────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Mobile** | React Native, Expo SDK 57, TypeScript |
| **Navigation** | React Navigation (tabs + native stack) |
| **Notifications** | Notifee (foreground service, 5 channels, deep links) |
| **Health data** | Health Connect (steps, sleep, heart rate) |
| **Charts** | react-native-svg (glucose curves, bar charts, scatter plots) |
| **Haptics** | expo-haptics |
| **Widget** | Kotlin AppWidgetProvider (native Android) |
| **Backend** | Node.js, Fastify, TypeScript |
| **Database** | PostgreSQL |
| **Infrastructure** | VPS (Linux), Caddy reverse proxy, Let's Encrypt TLS |
| **Build** | EAS Build (Expo Application Services) |

---

## Project Structure

```
src/
├── api/
│   └── client.ts          # Typed API client (all backend calls)
├── components/
│   ├── MetricCard.tsx      # Reusable colored metric tile
│   ├── WeekComparisonChart.tsx
│   └── BarcodeScannerModal.tsx
├── lib/
│   ├── smartNotifications.ts  # All 5 smart notification types
│   ├── foregroundService.ts   # Persistent tracking service
│   └── healthConnect.ts       # Health Connect sync
├── navigation/
│   ├── RootTabs.tsx       # Tab + stack navigator
│   └── navigationRef.ts   # Imperative navigation for notifications
├── screens/
│   ├── OverviewScreen.tsx  # Home — mood, glucose chart, event feed
│   ├── HealthScreen.tsx    # Glucose, steps, sleep, water, heart rate
│   ├── MealsScreen.tsx     # Meal logging + glucose response
│   ├── LifeScreen.tsx      # Books + hobbies
│   ├── FinanceScreen.tsx   # Spending
│   ├── SettingsScreen.tsx  # All toggles and preferences
│   ├── StepsDetailScreen.tsx
│   ├── TrendsScreen.tsx    # Correlation scatter plots
│   └── HistoryScreen.tsx   # Search across all data types
└── theme/
    ├── theme.ts            # Light + dark color tokens
    └── ThemeContext.tsx    # Toggle-able theme provider

plugins/
├── withAndroidWidget.js    # EAS config plugin — widget XML + Kotlin
├── withAndroidShortcuts.js # EAS config plugin — app shortcuts
└── android-widget/
    ├── RippleWidgetProvider.kt
    ├── ripple_widget.xml
    └── ripple_widget_info.xml
```

---

## Backend

The API lives at [`ripple-health-backend`](https://github.com/kellehsm/ripple-health-backend) — a Fastify/PostgreSQL server handling all data storage, Dexcom sync, food lookups, and aggregation queries.

---

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=14&height=80&section=footer" width="100%" />
</div>
