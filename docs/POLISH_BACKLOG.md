# Polish Backlog

Living document — append new polish ideas as they surface; remove items once shipped. Pick any to implement.

---

### 1. Glucose chip dynamic color
Border + icon circle dynamically shifts:
- Green when 70–140 mg/dL (in range)
- Amber when 140–180 mg/dL (slightly elevated)
- Red when >180 or <70 mg/dL (out of range)

Zero backend change — pure client math on the existing `glucoseStatus.mg_dl` value.

---

### 2. Streak milestone confetti
Micro confetti burst fires from the streak row the moment a streak count increments (detected by comparing previous vs. new count). Not triggered on every refresh — only on actual new-day increment.

---

### 3. Bar chart grow-on-mount
The correlation chart bars in the Trends/Overview card animate up from height 0 with a per-bar stagger (30–40ms offset), instead of just appearing at full height.

---

### 4. Finance category bars fill
When FinanceScreen loads or you switch month, the per-category spending bars sweep in left-to-right with a 40ms stagger delay per bar.

---

### 5. Long-press chip → quick-log sheet
Hold any metric chip 400ms → compact bottom sheet appears with the one-tap log action for that metric:
- Water: +1 glass button
- Mood: 5-emoji row
- Steps / Glucose: deep-links to the detail screen
- Meals: opens log-meal flow

---

### 6. Insight card double-tap to pin
Double-tapping an insight card pins it (instead of the current icon button), with a ❤️ emoji burst animation at the tap location.

---

### 7. Meal macro donut
Replace the linear macro progress bars in MealsScreen with a compact donut ring — carbs, protein, and fat as three arc segments. Tapping the ring shows the breakdown tooltip. Pure SVG, no backend change.

---

### 8. Heart rate sparkline
Tiny live line graph rendered inside the HR chip on OverviewScreen instead of just the BPM number. Draws the last 6–8 readings as a miniature SVG polyline in the chip background. Data already available from `hrReadings` state.

---

### 9. Finance spending heatmap
Calendar-style grid on FinanceScreen where each day cell shades darker proportional to spend amount for that day. Gives an instant visual of heavy-spend days without needing to scroll through transactions. Data comes from existing transaction list.
