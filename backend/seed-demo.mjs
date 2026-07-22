/**
 * Demo account seed script — 3.5 months of intensive data with full variation
 * Run from: /root/wellness-app-multiuser-dev/backend
 * Usage: node seed-demo.mjs
 */

import pg from "pg";

const pool = new pg.Pool({
  host: "localhost", port: 5432,
  database: "wellness_multiuser_dev",
  user: "wellness_user", password: "Sherl0cked12@@"
});
const q = (sql, params) => pool.query(sql, params);

const USER_ID = "c51b97ef-10fc-4369-873a-972b657bcfcf";

const START = new Date("2026-04-05T00:00:00-05:00");
const END   = new Date("2026-07-22T23:59:00-05:00");

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.round(rand(min, max)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Seeded pseudo-random for day-level consistency
function dayRand(dayOffset, salt) {
  const x = Math.sin(dayOffset * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function eachDay(fn) {
  const d = new Date(START);
  let i = 0;
  while (d <= END) {
    fn(new Date(d), i);
    d.setDate(d.getDate() + 1);
    i++;
  }
}

function dayTs(day, h, m = 0) {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// ──────────────────────────────────────────────────────────
console.log("Clearing existing demo data…");
await q("DELETE FROM exercise_log_entries WHERE session_id IN (SELECT id FROM exercise_sessions WHERE user_id=$1)", [USER_ID]);
await q("DELETE FROM exercise_sessions WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM reading_logs WHERE book_id IN (SELECT id FROM books WHERE user_id=$1)", [USER_ID]);
await q("DELETE FROM books WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM hobby_logs WHERE hobby_id IN (SELECT id FROM hobbies WHERE user_id=$1)", [USER_ID]);
await q("DELETE FROM hobbies WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM metric_logs WHERE metric_id IN (SELECT id FROM metrics WHERE user_id=$1)", [USER_ID]);
await q("DELETE FROM metrics WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM glucose_readings WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM heart_rate_readings WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM sleep_sessions WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM meals WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM journal_entries WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM spending_entries WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM daily_summary WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM daily_summaries WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM chart_annotations WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM substance_logs WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM cycle_day_logs WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM medication_dose_logs WHERE user_id=$1", [USER_ID]);
await q("DELETE FROM medication_schedule_slots WHERE medication_id IN (SELECT id FROM medications WHERE user_id=$1)", [USER_ID]);
await q("DELETE FROM medications WHERE user_id=$1", [USER_ID]);
console.log("Cleared.");

// ──────────────────────────────────────────────────────────
// METRICS
// ──────────────────────────────────────────────────────────
const { rows: [waterMetric] } = await q(
  `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
   VALUES ($1,'water','number','glasses','water','teal') RETURNING id`, [USER_ID]);
const { rows: [stepsMetric] } = await q(
  `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
   VALUES ($1,'steps','number','steps','walk','teal') RETURNING id`, [USER_ID]);
const { rows: [screenMetric] } = await q(
  `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
   VALUES ($1,'screen_time','duration_minutes','minutes','phone-portrait','coral') RETURNING id`, [USER_ID]);
const { rows: [mindfulnessMetric] } = await q(
  `INSERT INTO metrics (user_id, name, value_type, unit, icon, color_key)
   VALUES ($1,'mindfulness','duration_minutes','minutes','leaf','teal') RETURNING id`, [USER_ID]);

// ──────────────────────────────────────────────────────────
// MEDICATIONS
// ──────────────────────────────────────────────────────────
const { rows: [med1] } = await q(
  `INSERT INTO medications (user_id, name, dosage, active, purpose, drug_class)
   VALUES ($1, 'Metformin', '500mg', true, 'Blood glucose management', 'Biguanide') RETURNING id`,
  [USER_ID]);
const { rows: [med1SlotMorning] } = await q(
  `INSERT INTO medication_schedule_slots (medication_id, time_of_day, specific_time, sort_order)
   VALUES ($1, 'morning', '08:00', 0) RETURNING id`, [med1.id]);
const { rows: [med1SlotEvening] } = await q(
  `INSERT INTO medication_schedule_slots (medication_id, time_of_day, specific_time, sort_order)
   VALUES ($1, 'evening', '20:00', 1) RETURNING id`, [med1.id]);

const { rows: [med2] } = await q(
  `INSERT INTO medications (user_id, name, dosage, active, purpose, drug_class)
   VALUES ($1, 'Vitamin D3', '2000 IU', true, 'Immune support & mood', 'Vitamin supplement') RETURNING id`,
  [USER_ID]);
const { rows: [med2Slot] } = await q(
  `INSERT INTO medication_schedule_slots (medication_id, time_of_day, specific_time, sort_order)
   VALUES ($1, 'morning', '08:00', 0) RETURNING id`, [med2.id]);

// ──────────────────────────────────────────────────────────
// HOBBIES
// ──────────────────────────────────────────────────────────
const { rows: [guitar] } = await q(
  `INSERT INTO hobbies (user_id, name, unit_label, icon, color_key)
   VALUES ($1,'Guitar','minutes practiced','musical-notes','teal') RETURNING id`, [USER_ID]);
const { rows: [running] } = await q(
  `INSERT INTO hobbies (user_id, name, unit_label, icon, color_key)
   VALUES ($1,'Running','km','fitness','coral') RETURNING id`, [USER_ID]);

// ──────────────────────────────────────────────────────────
// BOOKS
// ──────────────────────────────────────────────────────────
const bookList = [
  { title: "Atomic Habits", author: "James Clear", total_pages: 320, started_at: "2026-04-05", finished_at: "2026-04-28", status: "finished", rating: 5 },
  { title: "The Power of Now", author: "Eckhart Tolle", total_pages: 236, started_at: "2026-04-29", finished_at: "2026-05-18", status: "finished", rating: 4 },
  { title: "Deep Work", author: "Cal Newport", total_pages: 296, started_at: "2026-05-19", finished_at: "2026-06-10", status: "finished", rating: 4 },
  { title: "Why We Sleep", author: "Matthew Walker", total_pages: 368, started_at: "2026-06-11", finished_at: "2026-07-02", status: "finished", rating: 5 },
  { title: "Outlive", author: "Peter Attia", total_pages: 496, started_at: "2026-07-03", finished_at: null, status: "reading", rating: null },
];

const bookIds = [];
for (const b of bookList) {
  const { rows: [book] } = await q(
    `INSERT INTO books (user_id, title, author, total_pages, status, rating, started_at, finished_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [USER_ID, b.title, b.author, b.total_pages, b.status, b.rating, b.started_at, b.finished_at]
  );
  bookIds.push({ ...b, id: book.id });
}

// ──────────────────────────────────────────────────────────
// EXERCISE LIBRARY
// ──────────────────────────────────────────────────────────
const { rows: exercises } = await q("SELECT id, name FROM exercise_library LIMIT 20");

// ──────────────────────────────────────────────────────────
// MEAL DATA
// ──────────────────────────────────────────────────────────
const breakfasts = [
  { name: "Oatmeal with berries", carbs_g: 45, sugar_g: 12, calories: 320, caffeine_mg: 0 },
  { name: "Scrambled eggs & toast", carbs_g: 28, sugar_g: 3, calories: 380, caffeine_mg: 0 },
  { name: "Greek yogurt & granola", carbs_g: 52, sugar_g: 18, calories: 420, caffeine_mg: 0 },
  { name: "Avocado toast", carbs_g: 32, sugar_g: 2, calories: 350, caffeine_mg: 0 },
  { name: "Banana & peanut butter", carbs_g: 40, sugar_g: 16, calories: 310, caffeine_mg: 0 },
  { name: "Protein smoothie", carbs_g: 38, sugar_g: 22, calories: 370, caffeine_mg: 0 },
  { name: "Pancakes with syrup", carbs_g: 82, sugar_g: 34, calories: 580, caffeine_mg: 0 },
  { name: "Bagel with cream cheese", carbs_g: 68, sugar_g: 8, calories: 460, caffeine_mg: 0 },
  { name: "Cereal & milk", carbs_g: 55, sugar_g: 22, calories: 350, caffeine_mg: 0 },
];
const lunches = [
  { name: "Grilled chicken salad", carbs_g: 18, sugar_g: 4, calories: 420, caffeine_mg: 0 },
  { name: "Turkey & avocado wrap", carbs_g: 45, sugar_g: 5, calories: 520, caffeine_mg: 0 },
  { name: "Quinoa bowl", carbs_g: 52, sugar_g: 6, calories: 480, caffeine_mg: 0 },
  { name: "Lentil soup & bread", carbs_g: 60, sugar_g: 8, calories: 440, caffeine_mg: 0 },
  { name: "Tuna sandwich", carbs_g: 38, sugar_g: 4, calories: 490, caffeine_mg: 0 },
  { name: "Burrito bowl", carbs_g: 65, sugar_g: 6, calories: 580, caffeine_mg: 0 },
  { name: "Pizza slice x2", carbs_g: 76, sugar_g: 10, calories: 620, caffeine_mg: 0 },
  { name: "Ramen", carbs_g: 72, sugar_g: 6, calories: 550, caffeine_mg: 0 },
];
const dinners = [
  { name: "Salmon & roasted vegetables", carbs_g: 22, sugar_g: 8, calories: 520, caffeine_mg: 0 },
  { name: "Chicken stir fry with rice", carbs_g: 68, sugar_g: 10, calories: 610, caffeine_mg: 0 },
  { name: "Pasta with marinara", carbs_g: 78, sugar_g: 12, calories: 580, caffeine_mg: 0 },
  { name: "Grilled steak & sweet potato", carbs_g: 35, sugar_g: 9, calories: 640, caffeine_mg: 0 },
  { name: "Veggie curry & rice", carbs_g: 72, sugar_g: 14, calories: 540, caffeine_mg: 0 },
  { name: "Turkey meatballs & zucchini", carbs_g: 20, sugar_g: 6, calories: 490, caffeine_mg: 0 },
  { name: "Tacos", carbs_g: 55, sugar_g: 8, calories: 620, caffeine_mg: 0 },
  { name: "Sushi takeout", carbs_g: 88, sugar_g: 14, calories: 680, caffeine_mg: 0 },
  { name: "Fast food burger & fries", carbs_g: 95, sugar_g: 18, calories: 890, caffeine_mg: 0 },
  { name: "Grilled fish & salad", carbs_g: 15, sugar_g: 5, calories: 410, caffeine_mg: 0 },
];
const snacks = [
  { name: "Coffee", carbs_g: 2, sugar_g: 0, calories: 5, caffeine_mg: 120 },
  { name: "Latte", carbs_g: 14, sugar_g: 12, calories: 120, caffeine_mg: 80 },
  { name: "Energy drink", carbs_g: 28, sugar_g: 26, calories: 110, caffeine_mg: 160 },
  { name: "Apple", carbs_g: 25, sugar_g: 19, calories: 95, caffeine_mg: 0 },
  { name: "Almonds", carbs_g: 6, sugar_g: 1, calories: 160, caffeine_mg: 0 },
  { name: "Protein bar", carbs_g: 28, sugar_g: 10, calories: 210, caffeine_mg: 0 },
  { name: "Dark chocolate", carbs_g: 18, sugar_g: 12, calories: 170, caffeine_mg: 30 },
  { name: "Chips", carbs_g: 35, sugar_g: 2, calories: 280, caffeine_mg: 0 },
  { name: "Ice cream", carbs_g: 42, sugar_g: 36, calories: 320, caffeine_mg: 0 },
];

const spendingCategories = [
  { category: "food", merchants: ["Chipotle", "Starbucks", "Whole Foods", "Trader Joes", "McDonald's", "Local Diner", "Subway", "Panera", "Sweetgreen", "DoorDash"], amounts: [8, 12, 18, 24, 32, 45, 6, 14, 16, 28] },
  { category: "subscriptions", merchants: ["Netflix", "Spotify", "Apple iCloud", "YouTube Premium"], amounts: [15.99, 9.99, 2.99, 13.99] },
  { category: "transport", merchants: ["Uber", "Shell Gas", "BP Gas", "Lyft", "Transit"], amounts: [12, 45, 52, 18, 3.50] },
  { category: "health", merchants: ["CVS Pharmacy", "Gym Membership", "Vitamins Online", "Therapy session"], amounts: [28, 35, 42, 150] },
  { category: "shopping", merchants: ["Amazon", "Target", "Best Buy", "HomeGoods", "Nordstrom"], amounts: [24, 38, 89, 54, 120] },
  { category: "entertainment", merchants: ["Movie tickets", "Concert tickets", "Bar tab", "Game purchase"], amounts: [18, 75, 55, 35] },
  { category: "misc", merchants: ["ATM Withdrawal", "Venmo", "Parking"], amounts: [40, 25, 8] },
];

const moodLabels = ["terrible", "rough", "okay", "good", "great"];
const journalTexts = [
  "Feeling pretty good today. Got a solid workout in and ate well. Glucose stayed in range most of the day.",
  "Rough night's sleep caught up with me. Energy was low all day, noticed glucose was a bit higher too.",
  "Had a really productive day. Focused well in the morning, hit the gym after work. Feeling accomplished.",
  "Stressed about work deadlines. Noticed I snacked more than usual. Going to try to get to bed earlier tonight.",
  "Great day overall. Meal prepped for the week which always makes me feel on top of things.",
  "Energy was solid today. Morning run helped set the tone. Glucose looked good all day.",
  "Bit tired but pushed through. Coffee helped. Need to watch the afternoon sugar cravings.",
  "Really good sleep last night — felt the difference today. Sharp, focused, good mood.",
  "Social dinner tonight with friends. Ate more than planned but worth it. Life is about balance.",
  "Felt a bit off today, not sure why. Took it easy, focused on hydration.",
  "Productive morning, sluggish afternoon. Mid-day glucose dip I think.",
  "Long walk after dinner felt amazing. Need to do that more often.",
  "Checked in on my metrics — progress is real. Sleep and steps improving week over week.",
  "Tried a new recipe tonight. Turned out great. Cooking more is one habit I want to keep.",
  "Weekend reset. Long sleep, slow morning, good food. Exactly what I needed.",
  "Meditation this morning really helped. Felt calmer and more focused all day.",
  "Had a few drinks last night — definitely feeling it this morning. Sleep was rough.",
  "Skipped the gym today. Felt guilty about it but also needed the rest.",
  "Period started — cramps bad today. Low energy, took it easy.",
  "Feeling hormonal and irritable. Chocolate and Netflix night.",
  "Bad glucose day. Ate too many carbs and didn't move enough.",
  "Amazing run this morning — felt like I could go forever. Those days are rare.",
  "Work stress peaked today. Emotional spending happened. Need to break that pattern.",
  "Good mindfulness session before bed. Slept way better than usual.",
  "High caffeine day — needed it but probably regret it tonight.",
];

// ──────────────────────────────────────────────────────────
// CYCLE DATA (4 cycles over 3.5 months)
// Cycle 1: Apr 5-9 (period), Apr 10-18 (follicular), Apr 19-21 (ovulation), Apr 22 - May 4 (luteal)
// Cycle 2: May 5-9, May 10-18, May 19-21, May 22 - Jun 3
// Cycle 3: Jun 4-8, Jun 9-17, Jun 18-20, Jun 21 - Jul 3
// Cycle 4: Jul 4-8, Jul 9-17, Jul 18-22 (mid-follicular at cutoff)
// ──────────────────────────────────────────────────────────
const cycleDayLogsBatch = [];

function addCycleDays(startDateStr, endDateStr, phase) {
  const d = new Date(startDateStr + "T12:00:00-05:00");
  const end = new Date(endDateStr + "T12:00:00-05:00");
  let dayNum = 0;
  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10);
    let flowIntensity = "none";
    let symptoms = [];
    let moodLabel = null;
    let energyLevel = 5;

    if (phase === "period_heavy") {
      flowIntensity = dayNum <= 1 ? "heavy" : dayNum <= 3 ? "medium" : "light";
      symptoms = dayNum <= 2 ? ["cramps", "bloating", "fatigue"] : ["cramps", "fatigue"];
      moodLabel = dayNum <= 1 ? "terrible" : "rough";
      energyLevel = dayNum <= 1 ? 3 : 4;
    } else if (phase === "follicular") {
      flowIntensity = "none";
      symptoms = dayNum < 3 ? ["spotting"] : [];
      moodLabel = dayNum > 4 ? "good" : "okay";
      energyLevel = 5 + Math.min(dayNum, 3);
    } else if (phase === "ovulation") {
      symptoms = ["ovulation_pain"];
      moodLabel = "great";
      energyLevel = 9;
    } else if (phase === "luteal") {
      symptoms = dayNum > 6 ? ["bloating", "mood_swings", "breast_tenderness"] : [];
      moodLabel = dayNum > 6 ? "rough" : "okay";
      energyLevel = dayNum > 6 ? 4 : 6;
    }

    cycleDayLogsBatch.push([
      USER_ID, dateStr, flowIntensity,
      `{${symptoms.map(s => `"${s}"`).join(",")}}`,
      moodLabel,
      energyLevel
    ]);
    d.setDate(d.getDate() + 1);
    dayNum++;
  }
}

// Cycle 1
addCycleDays("2026-04-05", "2026-04-09", "period_heavy");
addCycleDays("2026-04-10", "2026-04-18", "follicular");
addCycleDays("2026-04-19", "2026-04-21", "ovulation");
addCycleDays("2026-04-22", "2026-05-04", "luteal");
// Cycle 2
addCycleDays("2026-05-05", "2026-05-09", "period_heavy");
addCycleDays("2026-05-10", "2026-05-18", "follicular");
addCycleDays("2026-05-19", "2026-05-21", "ovulation");
addCycleDays("2026-05-22", "2026-06-03", "luteal");
// Cycle 3
addCycleDays("2026-06-04", "2026-06-08", "period_heavy");
addCycleDays("2026-06-09", "2026-06-17", "follicular");
addCycleDays("2026-06-18", "2026-06-20", "ovulation");
addCycleDays("2026-06-21", "2026-07-03", "luteal");
// Cycle 4
addCycleDays("2026-07-04", "2026-07-08", "period_heavy");
addCycleDays("2026-07-09", "2026-07-22", "follicular");

// ──────────────────────────────────────────────────────────
// MAIN LOOP
// ──────────────────────────────────────────────────────────
console.log("Seeding day-by-day data…");

let glucoseBatch = [];
let heartRateBatch = [];
let sleepBatch = [];
let mealBatch = [];
let journalBatch = [];
let spendingBatch = [];
let metricLogBatch = [];
let hobbyLogBatch = [];
let readingLogBatch = [];
let exerciseBatch = [];
let substanceLogBatch = [];
let medicationDoseLogBatch = [];

// Determine cycle phase for a date
function getCyclePhase(dayIdx) {
  // Simplified: period days 0-4, 30-34, 60-64, 90-94
  const mod = dayIdx % 30;
  if (mod <= 4) return "period";
  if (mod <= 13) return "follicular";
  if (mod <= 15) return "ovulation";
  return "luteal";
}

eachDay((day, dayIdx) => {
  const dr = (salt) => dayRand(dayIdx, salt);
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const cyclePhase = getCyclePhase(dayIdx);
  const isPeriod = cyclePhase === "period";
  const isLuteal = cyclePhase === "luteal";
  const isOvulation = cyclePhase === "ovulation";

  // Day "quality" — drives correlated metrics (lower on bad days)
  // Creates realistic correlation between sleep, mood, steps
  const dayQuality = dr(1); // 0-1, high = good day

  // ── SLEEP ─────────────────────────────────────────────
  // Wide variation: some 4h nights (bad days, period, late nights)
  // Some 9-10h nights (weekends, recovery)
  let sleepHours;
  if (dr(5) < 0.08) {
    sleepHours = rand(3.5, 5.0); // bad night ~8% of days
  } else if (isPeriod && dr(6) < 0.5) {
    sleepHours = rand(5.0, 6.5); // worse sleep during period
  } else if (isWeekend) {
    sleepHours = rand(7.5, 10.0); // long weekend sleep
  } else if (dayQuality > 0.7) {
    sleepHours = rand(7.5, 9.0); // good quality days → good sleep
  } else if (dayQuality < 0.3) {
    sleepHours = rand(5.0, 6.5); // bad days → less sleep
  } else {
    sleepHours = rand(6.2, 8.2); // typical weekday
  }
  sleepHours = clamp(sleepHours, 3.5, 10.5);

  const wakeH = isWeekend ? randInt(7, 10) : randInt(6, 8);
  const wakeM = randInt(0, 59);
  const wake = new Date(day);
  wake.setHours(wakeH, wakeM, 0, 0);
  const sleepStart = new Date(wake.getTime() - sleepHours * 3600 * 1000);
  const qualityScore = sleepHours > 7.5 ? randInt(4, 5) : sleepHours > 6 ? randInt(3, 4) : randInt(1, 3);
  sleepBatch.push([USER_ID, sleepStart.toISOString(), wake.toISOString(), qualityScore]);

  // ── GLUCOSE (CGM — every 5 min) ───────────────────────
  const breakfastH = wakeH + (dr(10) > 0.5 ? 1 : 0);
  const lunchH = 12 + randInt(-1, 1);
  const dinnerH = 18 + randInt(-1, 2);
  const hasMorningSnack = dr(11) > 0.5;
  const hasAfternoonSnack = dr(12) > 0.45;
  const hadHighCarbDay = dr(13) < 0.35; // 35% of days have a high-carb meal

  // Fasting baseline varies more — lower on exercise days, higher on poor sleep days
  const fastingBase = sleepHours < 6 ? rand(90, 115) : rand(72, 100);
  let glucose = fastingBase;
  const glucoseDay = [];

  for (let min = 0; min < 1440; min += 5) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const ts = new Date(day);
    ts.setHours(h, m, 0, 0);

    const minsFromBreakfast = min - breakfastH * 60;
    const minsFromLunch = min - lunchH * 60;
    const minsFromDinner = min - dinnerH * 60;
    const minsFromMorningSnack = hasMorningSnack ? min - (breakfastH * 60 + 150) : 9999;
    const minsFromAfternoonSnack = hasAfternoonSnack ? min - (14 * 60 + 30) : 9999;

    let spike = 0;
    const mealSpike = (minsFrom, carbFactor) => {
      if (minsFrom >= 0 && minsFrom < 90) {
        return carbFactor * Math.sin((minsFrom / 90) * Math.PI);
      }
      return 0;
    };

    // High-carb days get bigger spikes (up to 240)
    const carbMult = hadHighCarbDay ? rand(1.3, 1.8) : 1.0;
    spike += mealSpike(minsFromBreakfast, rand(30, 65) * carbMult);
    spike += mealSpike(minsFromLunch, rand(25, 60) * carbMult);
    spike += mealSpike(minsFromDinner, rand(25, 65) * carbMult);
    spike += mealSpike(minsFromMorningSnack, rand(8, 22));
    spike += mealSpike(minsFromAfternoonSnack, rand(10, 30));

    // Poor sleep → higher baseline throughout the day
    const sleepPenalty = sleepHours < 6 ? rand(5, 18) : 0;
    glucose += (fastingBase + spike + sleepPenalty - glucose) * 0.06 + rand(-2, 2);
    glucose = clamp(glucose, 58, 248);

    // Occasional random spikes
    if (dr(20 + min) < 0.003) glucose = clamp(glucose + rand(20, 45), 58, 248);
    // Occasional lows (exercise + missed meal)
    if (h >= 10 && h <= 14 && dr(21 + min) < 0.001 && dayQuality < 0.3) {
      glucose = clamp(glucose - rand(20, 35), 58, 248);
    }

    const trends = ["steady", "rising", "falling", "rising_slowly", "falling_slowly"];
    const trend = glucose > 160 ? "falling" : glucose < 75 ? "rising" : pick(trends.slice(0, 3));
    glucoseDay.push([USER_ID, ts.toISOString(), Math.round(glucose), trend]);
  }
  glucoseBatch.push(...glucoseDay);

  // ── HEART RATE ────────────────────────────────────────
  const restingHR = clamp(randInt(55, 75) - (isWeekend ? 3 : 0) - (dayQuality > 0.7 ? 3 : 0), 45, 85);
  const hrCount = randInt(8, 16);
  for (let i = 0; i < hrCount; i++) {
    const hrH = randInt(wakeH, 22);
    const isExerciseTime = hrH >= 16 && hrH <= 20 && dr(30 + i) > 0.4;
    const bpm = isExerciseTime ? randInt(125, 175) : randInt(restingHR - 6, restingHR + 15);
    heartRateBatch.push([USER_ID, dayTs(day, hrH, randInt(0, 55)), clamp(bpm, 42, 185)]);
  }

  // ── MEALS ─────────────────────────────────────────────
  const breakfast = pick(breakfasts);
  // Add extra caffeine to coffee drinkers (separate drink)
  const morningCoffee = dr(41) > 0.15 ? randInt(80, 200) : 0;
  mealBatch.push([USER_ID, dayTs(day, breakfastH, randInt(0, 30)), breakfast.name, "breakfast",
    breakfast.carbs_g, breakfast.sugar_g, breakfast.calories, breakfast.caffeine_mg + morningCoffee]);

  if (hasMorningSnack) {
    const snack = pick(snacks.slice(0, 3)); // coffee/energy drinks mostly
    mealBatch.push([USER_ID, dayTs(day, breakfastH + randInt(1, 3), randInt(0, 45)), snack.name, "snack",
      snack.carbs_g, snack.sugar_g, snack.calories, snack.caffeine_mg]);
  }

  // Skip lunch ~10% of days (skipped meals effect)
  if (dr(42) > 0.1) {
    const lunch = pick(lunches);
    mealBatch.push([USER_ID, dayTs(day, lunchH, randInt(0, 45)), lunch.name, "lunch",
      lunch.carbs_g, lunch.sugar_g, lunch.calories, lunch.caffeine_mg]);
  }

  if (hasAfternoonSnack) {
    const snack = pick(snacks.slice(3));
    mealBatch.push([USER_ID, dayTs(day, 14, randInt(30, 59)), snack.name, "snack",
      snack.carbs_g, snack.sugar_g, snack.calories, snack.caffeine_mg]);
  }

  const dinner = pick(dinners);
  // Late dinner ~20% of days
  const dinnerActualH = dr(43) < 0.2 ? dinnerH + randInt(2, 3) : dinnerH;
  mealBatch.push([USER_ID, dayTs(day, clamp(dinnerActualH, 17, 23), randInt(0, 45)), dinner.name, "dinner",
    dinner.carbs_g, dinner.sugar_g, dinner.calories, dinner.caffeine_mg]);

  // ── JOURNAL / MOOD ────────────────────────────────────
  if (dr(40) > 0.2) { // ~80% of days
    // Mood correlated with day quality + cycle phase
    let moodBase;
    if (isPeriod) {
      moodBase = clamp(Math.round(dayQuality * 2.5 + 1), 1, 3);
    } else if (isLuteal && dr(44) > 0.4) {
      moodBase = clamp(Math.round(dayQuality * 3 + 1), 1, 4);
    } else if (isOvulation) {
      moodBase = clamp(Math.round(dayQuality * 2 + 3), 3, 5);
    } else {
      moodBase = clamp(Math.round(dayQuality * 4 + 1), 1, 5);
    }
    const label = moodLabels[moodBase - 1];
    const text = dr(45) > 0.35 ? pick(journalTexts) : null;
    journalBatch.push([USER_ID, dayTs(day, 21, randInt(0, 45)), moodBase, label, text]);
  }

  // ── SPENDING ──────────────────────────────────────────
  // Bad-mood days → more impulsive spending
  const isEmotionalSpend = dayQuality < 0.3 && dr(50) > 0.4;

  spendingBatch.push([USER_ID, dayTs(day, randInt(7, 10), randInt(0, 55)),
    rand(4, 8).toFixed(2), "food", pick(["Starbucks", "Local Coffee", "Dunkin"])]);

  if (dr(51) > 0.25) {
    spendingBatch.push([USER_ID, dayTs(day, lunchH, randInt(0, 30)),
      rand(10, 28).toFixed(2), "food", pick(["Chipotle", "Local Deli", "Subway", "Panera", "Sweetgreen", "DoorDash"])]);
  }

  if (dr(52) > 0.55) {
    spendingBatch.push([USER_ID, dayTs(day, dinnerH + 1, randInt(0, 30)),
      rand(18, 65).toFixed(2), "food", pick(["Local Restaurant", "DoorDash", "Uber Eats", "Italian Place", "Sushi"])]);
  }

  if (isWeekend && dr(53) > 0.35) {
    spendingBatch.push([USER_ID, dayTs(day, randInt(10, 14), randInt(0, 45)),
      rand(55, 145).toFixed(2), "food", pick(["Whole Foods", "Trader Joe's", "Costco", "Kroger"])]);
  }

  // Emotional spending (bad mood days)
  if (isEmotionalSpend) {
    const cat = pick(spendingCategories.slice(4)); // shopping/entertainment/misc
    spendingBatch.push([USER_ID, dayTs(day, randInt(14, 21), randInt(0, 55)),
      rand(25, 95).toFixed(2), cat.category, pick(cat.merchants)]);
    if (dr(54) > 0.5) {
      spendingBatch.push([USER_ID, dayTs(day, randInt(18, 22), randInt(0, 55)),
        rand(15, 55).toFixed(2), "food", pick(["DoorDash", "Uber Eats", "Late night food"])]);
    }
  }

  // Entertainment spending (20% of days)
  if (dr(55) > 0.8) {
    const cat = spendingCategories[5]; // entertainment
    spendingBatch.push([USER_ID, dayTs(day, randInt(17, 22), randInt(0, 55)),
      pick(cat.amounts).toFixed(2), cat.category, pick(cat.merchants)]);
  }

  // Subscriptions
  if (day.getDate() === 1) {
    spendingBatch.push([USER_ID, dayTs(day, 9, 0), "15.99", "subscriptions", "Netflix"]);
    spendingBatch.push([USER_ID, dayTs(day, 9, 1), "9.99", "subscriptions", "Spotify"]);
  }
  if (day.getDate() === 5) {
    spendingBatch.push([USER_ID, dayTs(day, 9, 0), "35.00", "health", "Gym Membership"]);
  }

  if (dr(56) > 0.72) {
    const cat = pick(spendingCategories.slice(2, 5));
    spendingBatch.push([USER_ID, dayTs(day, randInt(12, 20), randInt(0, 55)),
      pick(cat.amounts).toFixed(2), cat.category, pick(cat.merchants)]);
  }

  // ── METRIC LOGS (water, steps, mindfulness) ───────────
  // Water: less on bad days, more on good days and exercise days
  const glasses = dayQuality > 0.6 ? randInt(7, 11) : dayQuality < 0.3 ? randInt(2, 5) : randInt(4, 8);
  metricLogBatch.push([waterMetric.id, dayTs(day, 21, 30), glasses]);

  // Steps: correlated with day quality; some very low days, some very high
  let steps;
  if (dr(61) < 0.07) {
    steps = randInt(800, 2500); // very low steps ~7%
  } else if (isPeriod && dr(62) < 0.6) {
    steps = randInt(2000, 5500); // fewer steps during period
  } else if (isWeekend && dayQuality > 0.5) {
    steps = randInt(9000, 18000); // big weekend walks
  } else if (dayQuality > 0.7) {
    steps = randInt(9000, 15000); // active good days
  } else if (dayQuality < 0.25) {
    steps = randInt(1500, 4500); // sedentary bad days
  } else {
    steps = isWeekend ? randInt(5000, 12000) : randInt(4000, 10000);
  }
  metricLogBatch.push([stepsMetric.id, dayTs(day, 22, 0), steps]);

  const screenMin = isWeekend ? randInt(100, 320) : randInt(80, 240);
  metricLogBatch.push([screenMetric.id, dayTs(day, 22, 30), screenMin]);

  // Mindfulness: ~35% of days, more likely on good quality days
  // On mindfulness days, mood is correlated higher (seeded that way)
  const hasMindfulness = (dayQuality > 0.55 && dr(63) > 0.45) || dr(64) > 0.85;
  if (hasMindfulness) {
    const mindfulMin = randInt(8, 25);
    metricLogBatch.push([mindfulnessMetric.id, dayTs(day, randInt(6, 9), randInt(0, 45)), mindfulMin]);
  }

  // ── SUBSTANCE LOGS (alcohol) ───────────────────────────
  // Alcohol ~22% of days (mostly weekends, social events, bad days)
  const hasAlcohol = (isWeekend && dr(70) > 0.45) || (!isWeekend && dr(71) > 0.82);
  if (hasAlcohol) {
    const drinks = isWeekend ? randInt(1, 4) : randInt(1, 2);
    for (let d = 0; d < drinks; d++) {
      const drinkType = pick(["Beer", "Wine", "Cocktail", "Hard seltzer"]);
      const abvMap = { "Beer": 5.0, "Wine": 13.5, "Cocktail": 18.0, "Hard seltzer": 5.0 };
      const volMap = { "Beer": 355, "Wine": 150, "Cocktail": 90, "Hard seltzer": 355 };
      substanceLogBatch.push([
        USER_ID, "alcohol", drinkType,
        null, // caffeine_mg
        abvMap[drinkType], volMap[drinkType],
        dayTs(day, 19 + d, randInt(0, 55))
      ]);
    }
  }

  // ── MEDICATION DOSE LOGS ──────────────────────────────
  // Metformin morning (85% adherence)
  const dateStr = day.toISOString().slice(0, 10);
  if (dr(80) > 0.15) {
    medicationDoseLogBatch.push([USER_ID, med1.id, med1SlotMorning.id, dateStr, "taken", dayTs(day, 8, randInt(0, 30))]);
  }
  // Metformin evening (78% adherence)
  if (dr(81) > 0.22) {
    medicationDoseLogBatch.push([USER_ID, med1.id, med1SlotEvening.id, dateStr, "taken", dayTs(day, 20, randInt(0, 30))]);
  }
  // Vitamin D morning (90% adherence)
  if (dr(82) > 0.1) {
    medicationDoseLogBatch.push([USER_ID, med2.id, med2Slot.id, dateStr, "taken", dayTs(day, 8, randInt(5, 35))]);
  }

  // ── HOBBIES ───────────────────────────────────────────
  if (dr(83) > 0.5 && dayQuality > 0.35) { // guitar ~50% of good days
    const mins = randInt(15, 75);
    hobbyLogBatch.push([guitar.id, dayTs(day, 19, randInt(0, 45)), mins, randInt(3, 5)]);
  }
  if (dr(84) > 0.65 && !isWeekend && dayQuality > 0.4) { // running ~35% of weekdays
    const km = parseFloat(rand(3, 10).toFixed(1));
    hobbyLogBatch.push([running.id, dayTs(day, 6, randInt(15, 45)), km, randInt(3, 5)]);
  }
  if (isWeekend && dr(85) > 0.35 && dayQuality > 0.5) { // longer weekend runs
    const km = parseFloat(rand(6, 18).toFixed(1));
    hobbyLogBatch.push([running.id, dayTs(day, 8, randInt(0, 30)), km, randInt(4, 5)]);
  }

  // ── READING LOGS ──────────────────────────────────────
  const activeBook = bookIds.find(b => {
    const s = new Date(b.started_at);
    const e = b.finished_at ? new Date(b.finished_at) : END;
    return day >= s && day <= e;
  });
  if (activeBook && dr(90) > 0.28) {
    const pages = randInt(10, 55);
    readingLogBatch.push([activeBook.id, day.toISOString().slice(0, 10), pages]);
  }

  // ── EXERCISE SESSIONS (3-4x per week) ─────────────────
  if (exercises.length > 0 && dr(91) > 0.5 && dayQuality > 0.3 && !isPeriod) {
    exerciseBatch.push({ day, dayIdx });
  }
});

// ──────────────────────────────────────────────────────────
// BULK INSERTS
// ──────────────────────────────────────────────────────────

console.log(`Inserting ${cycleDayLogsBatch.length} cycle day logs…`);
for (const c of cycleDayLogsBatch) {
  await q(
    `INSERT INTO cycle_day_logs (user_id, log_date, flow_intensity, symptoms, mood_label, energy_level)
     VALUES ($1, $2, $3, $4::text[], $5, $6)
     ON CONFLICT (user_id, log_date) DO UPDATE SET
       flow_intensity = EXCLUDED.flow_intensity,
       symptoms = EXCLUDED.symptoms,
       mood_label = EXCLUDED.mood_label,
       energy_level = EXCLUDED.energy_level`,
    c
  );
}

console.log(`Inserting ${glucoseBatch.length} glucose readings…`);
for (let i = 0; i < glucoseBatch.length; i += 500) {
  const chunk = glucoseBatch.slice(i, i + 500);
  const vals = chunk.map((_, j) => `($${j*4+1},$${j*4+2},$${j*4+3},$${j*4+4})`).join(",");
  await q(`INSERT INTO glucose_readings (user_id,recorded_at,mg_dl,trend) VALUES ${vals} ON CONFLICT DO NOTHING`, chunk.flat());
}

console.log(`Inserting ${heartRateBatch.length} heart rate readings…`);
for (let i = 0; i < heartRateBatch.length; i += 500) {
  const chunk = heartRateBatch.slice(i, i + 500);
  const vals = chunk.map((_, j) => `($${j*3+1},$${j*3+2},$${j*3+3})`).join(",");
  await q(`INSERT INTO heart_rate_readings (user_id,recorded_at,bpm) VALUES ${vals} ON CONFLICT DO NOTHING`, chunk.flat());
}

console.log(`Inserting ${sleepBatch.length} sleep sessions…`);
for (const s of sleepBatch) {
  await q(`INSERT INTO sleep_sessions (user_id,start_time,end_time,quality_score) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, s);
}

console.log(`Inserting ${mealBatch.length} meals…`);
for (let i = 0; i < mealBatch.length; i += 200) {
  const chunk = mealBatch.slice(i, i + 200);
  const vals = chunk.map((_, j) => `($${j*8+1},$${j*8+2},$${j*8+3},$${j*8+4},$${j*8+5},$${j*8+6},$${j*8+7},$${j*8+8})`).join(",");
  await q(`INSERT INTO meals (user_id,logged_at,name,meal_type,carbs_g,sugar_g,calories,caffeine_mg) VALUES ${vals}`, chunk.flat());
}

console.log(`Inserting ${journalBatch.length} journal entries…`);
for (const j of journalBatch) {
  await q(`INSERT INTO journal_entries (user_id,logged_at,mood_score,mood_label,entry_text,entry_type) VALUES ($1,$2,$3,$4,$5,'journal')`, j);
}

console.log(`Inserting ${spendingBatch.length} spending entries…`);
for (let i = 0; i < spendingBatch.length; i += 200) {
  const chunk = spendingBatch.slice(i, i + 200);
  const vals = chunk.map((_, j) => `($${j*5+1},$${j*5+2},$${j*5+3},$${j*5+4},$${j*5+5})`).join(",");
  await q(`INSERT INTO spending_entries (user_id,logged_at,amount,category,merchant_name) VALUES ${vals}`, chunk.flat());
}

console.log(`Inserting ${metricLogBatch.length} metric logs…`);
for (const m of metricLogBatch) {
  await q(`INSERT INTO metric_logs (metric_id,logged_at,value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, m);
}

console.log(`Inserting ${substanceLogBatch.length} substance logs…`);
for (let i = 0; i < substanceLogBatch.length; i += 200) {
  const chunk = substanceLogBatch.slice(i, i + 200);
  const vals = chunk.map((_, j) => `($${j*7+1},$${j*7+2},$${j*7+3},$${j*7+4},$${j*7+5},$${j*7+6},$${j*7+7})`).join(",");
  await q(`INSERT INTO substance_logs (user_id,substance_type,name,caffeine_mg,abv_percent,volume_ml,logged_at) VALUES ${vals}`, chunk.flat());
}

console.log(`Inserting ${medicationDoseLogBatch.length} medication dose logs…`);
for (const d of medicationDoseLogBatch) {
  await q(
    `INSERT INTO medication_dose_logs (user_id,medication_id,slot_id,log_date,status,taken_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id,medication_id,slot_id,log_date) DO NOTHING`,
    d
  );
}

console.log(`Inserting hobby logs…`);
for (const h of hobbyLogBatch) {
  await q(`INSERT INTO hobby_logs (hobby_id,logged_at,amount,rating) VALUES ($1,$2,$3,$4)`, h);
}

console.log(`Inserting reading logs…`);
for (const r of readingLogBatch) {
  await q(`INSERT INTO reading_logs (book_id,logged_at,pages_read) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, r);
}

console.log(`Inserting exercise sessions…`);
for (const { day, dayIdx } of exerciseBatch) {
  const dr = (salt) => dayRand(dayIdx, salt);
  const sessionStart = new Date(day);
  sessionStart.setHours(randInt(6, 20), randInt(0, 45), 0, 0);
  const durationMin = randInt(25, 75);
  const sessionEnd = new Date(sessionStart.getTime() + durationMin * 60000);

  const { rows: [session] } = await q(
    `INSERT INTO exercise_sessions (user_id,started_at,ended_at) VALUES ($1,$2,$3) RETURNING id`,
    [USER_ID, sessionStart.toISOString(), sessionEnd.toISOString()]
  );

  const exCount = randInt(2, 5);
  for (let e = 0; e < exCount; e++) {
    const ex = exercises[randInt(0, exercises.length - 1)];
    await q(
      `INSERT INTO exercise_log_entries (session_id,exercise_id,sets,reps,weight_used)
       VALUES ($1,$2,$3,$4,$5)`,
      [session.id, ex.id, randInt(2, 5), randInt(6, 15), parseFloat(rand(15, 100).toFixed(1))]
    );
  }
}

await pool.end();
console.log("✅ Seed complete!");
