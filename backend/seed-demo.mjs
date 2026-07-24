/**
 * Demo account seed script — 3.5 months of realistic data
 * Run from: /root/wellness-app-multiuser-dev/backend
 * Usage: node /root/seed-demo.mjs
 */

import pg from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "wellness-app-multiuser-dev/backend/.env") });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = (sql, params) => pool.query(sql, params);

const USER_ID = "c51b97ef-10fc-4369-873a-972b657bcfcf";

// 3.5 months: Apr 5 → Jul 23 2026
const START = new Date("2026-04-05T00:00:00-05:00");
const END   = new Date("2026-07-23T23:59:00-05:00");

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
await q("DELETE FROM chart_annotations WHERE user_id=$1", [USER_ID]);
console.log("Cleared.");

// ──────────────────────────────────────────────────────────
// METRICS (water, steps, screen_time)
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
// EXERCISE LIBRARY (get existing entries or we'll skip)
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
];
const lunches = [
  { name: "Grilled chicken salad", carbs_g: 18, sugar_g: 4, calories: 420, caffeine_mg: 0 },
  { name: "Turkey & avocado wrap", carbs_g: 45, sugar_g: 5, calories: 520, caffeine_mg: 0 },
  { name: "Quinoa bowl", carbs_g: 52, sugar_g: 6, calories: 480, caffeine_mg: 0 },
  { name: "Lentil soup & bread", carbs_g: 60, sugar_g: 8, calories: 440, caffeine_mg: 0 },
  { name: "Tuna sandwich", carbs_g: 38, sugar_g: 4, calories: 490, caffeine_mg: 0 },
  { name: "Burrito bowl", carbs_g: 65, sugar_g: 6, calories: 580, caffeine_mg: 0 },
];
const dinners = [
  { name: "Salmon & roasted vegetables", carbs_g: 22, sugar_g: 8, calories: 520, caffeine_mg: 0 },
  { name: "Chicken stir fry with rice", carbs_g: 68, sugar_g: 10, calories: 610, caffeine_mg: 0 },
  { name: "Pasta with marinara", carbs_g: 78, sugar_g: 12, calories: 580, caffeine_mg: 0 },
  { name: "Grilled steak & sweet potato", carbs_g: 35, sugar_g: 9, calories: 640, caffeine_mg: 0 },
  { name: "Veggie curry & rice", carbs_g: 72, sugar_g: 14, calories: 540, caffeine_mg: 0 },
  { name: "Turkey meatballs & zucchini", carbs_g: 20, sugar_g: 6, calories: 490, caffeine_mg: 0 },
  { name: "Tacos", carbs_g: 55, sugar_g: 8, calories: 620, caffeine_mg: 0 },
];
const snacks = [
  { name: "Coffee", carbs_g: 2, sugar_g: 0, calories: 5, caffeine_mg: 120 },
  { name: "Latte", carbs_g: 14, sugar_g: 12, calories: 120, caffeine_mg: 80 },
  { name: "Apple", carbs_g: 25, sugar_g: 19, calories: 95, caffeine_mg: 0 },
  { name: "Almonds", carbs_g: 6, sugar_g: 1, calories: 160, caffeine_mg: 0 },
  { name: "Protein bar", carbs_g: 28, sugar_g: 10, calories: 210, caffeine_mg: 0 },
  { name: "Dark chocolate", carbs_g: 18, sugar_g: 12, calories: 170, caffeine_mg: 30 },
];

const spendingCategories = [
  { category: "food", merchants: ["Chipotle", "Starbucks", "Whole Foods", "Trader Joes", "McDonald's", "Local Diner", "Subway", "Panera"], amounts: [8, 12, 18, 24, 32, 45, 6, 14] },
  { category: "subscriptions", merchants: ["Netflix", "Spotify", "Apple iCloud", "YouTube Premium"], amounts: [15.99, 9.99, 2.99, 13.99] },
  { category: "transport", merchants: ["Uber", "Shell Gas", "BP Gas", "Lyft", "Transit"], amounts: [12, 45, 52, 18, 3.50] },
  { category: "health", merchants: ["CVS Pharmacy", "Gym Membership", "Vitamins Online"], amounts: [28, 35, 42] },
  { category: "shopping", merchants: ["Amazon", "Target", "Best Buy", "HomeGoods"], amounts: [24, 38, 89, 54] },
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
];

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

eachDay((day, dayIdx) => {
  const dr = (salt) => dayRand(dayIdx, salt);
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;

  // ── SLEEP ─────────────────────────────────────────────
  const sleepHours = isWeekend ? rand(7.5, 9.5) : rand(6.2, 8.2);
  const wakeH = isWeekend ? randInt(7, 9) : randInt(6, 7);
  const wakeM = randInt(0, 59);
  const wake = new Date(day);
  wake.setHours(wakeH, wakeM, 0, 0);
  const sleep = new Date(wake.getTime() - sleepHours * 3600 * 1000);
  sleepBatch.push([USER_ID, sleep.toISOString(), wake.toISOString(), randInt(3, 5)]);

  // ── GLUCOSE (CGM — every 5 min) ───────────────────────
  // Meal times (rough)
  const breakfastH = wakeH + (dr(10) > 0.5 ? 1 : 0);
  const lunchH = 12 + randInt(-1, 1);
  const dinnerH = 18 + randInt(-1, 2);
  const hasMorningSnack = dr(11) > 0.6;
  const hasAfternoonSnack = dr(12) > 0.5;

  let glucose = rand(82, 98); // fasting baseline
  const glucoseDay = [];

  for (let min = 0; min < 1440; min += 5) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const ts = new Date(day);
    ts.setHours(h, m, 0, 0);

    // Simulate meal spikes
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

    spike += mealSpike(minsFromBreakfast, rand(35, 65));
    spike += mealSpike(minsFromLunch, rand(30, 55));
    spike += mealSpike(minsFromDinner, rand(28, 60));
    spike += mealSpike(minsFromMorningSnack, rand(10, 25));
    spike += mealSpike(minsFromAfternoonSnack, rand(12, 28));

    // Drift back toward baseline
    glucose += (85 + spike - glucose) * 0.06 + rand(-1.5, 1.5);
    glucose = clamp(glucose, 65, 220);

    if (dr(20 + min) < 0.002) glucose = clamp(glucose + rand(15, 30), 65, 220); // occasional blip

    const trends = ["steady", "rising", "falling", "rising_slowly", "falling_slowly"];
    const trend = glucose > 140 ? "falling" : glucose < 80 ? "rising" : pick(trends.slice(0, 3));

    glucoseDay.push([USER_ID, ts.toISOString(), Math.round(glucose), trend]);
  }
  glucoseBatch.push(...glucoseDay);

  // ── HEART RATE ────────────────────────────────────────
  const restingHR = randInt(58, 72) + (isWeekend ? -2 : 0);
  const hrCount = randInt(8, 14);
  for (let i = 0; i < hrCount; i++) {
    const hrH = randInt(wakeH, 22);
    const isExerciseTime = hrH >= 17 && hrH <= 19 && dr(30 + i) > 0.5;
    const bpm = isExerciseTime ? randInt(120, 168) : randInt(restingHR - 5, restingHR + 12);
    heartRateBatch.push([USER_ID, dayTs(day, hrH, randInt(0, 55)), clamp(bpm, 45, 185)]);
  }

  // ── MEALS ─────────────────────────────────────────────
  const breakfast = pick(breakfasts);
  mealBatch.push([USER_ID, dayTs(day, breakfastH, randInt(0, 30)), breakfast.name, "breakfast", breakfast.carbs_g, breakfast.sugar_g, breakfast.calories, breakfast.caffeine_mg]);

  if (hasMorningSnack) {
    const snack = pick([snacks[0], snacks[1]]); // coffee mostly
    mealBatch.push([USER_ID, dayTs(day, breakfastH + 1 + randInt(1, 2), randInt(0, 45)), snack.name, "snack", snack.carbs_g, snack.sugar_g, snack.calories, snack.caffeine_mg]);
  }

  const lunch = pick(lunches);
  mealBatch.push([USER_ID, dayTs(day, lunchH, randInt(0, 45)), lunch.name, "lunch", lunch.carbs_g, lunch.sugar_g, lunch.calories, lunch.caffeine_mg]);

  if (hasAfternoonSnack) {
    const snack = pick(snacks.slice(2));
    mealBatch.push([USER_ID, dayTs(day, 14, randInt(30, 59)), snack.name, "snack", snack.carbs_g, snack.sugar_g, snack.calories, snack.caffeine_mg]);
  }

  const dinner = pick(dinners);
  mealBatch.push([USER_ID, dayTs(day, dinnerH, randInt(0, 45)), dinner.name, "dinner", dinner.carbs_g, dinner.sugar_g, dinner.calories, dinner.caffeine_mg]);

  // ── JOURNAL / MOOD ────────────────────────────────────
  if (dr(40) > 0.25) { // ~75% of days
    const moodBase = 3 + Math.round((dr(41) - 0.3) * 2);
    const mood = clamp(moodBase, 1, 5);
    const label = moodLabels[mood - 1];
    const text = dr(42) > 0.3 ? pick(journalTexts) : null;
    journalBatch.push([USER_ID, dayTs(day, 21, randInt(0, 45)), mood, label, text]);
  }

  // ── SPENDING ──────────────────────────────────────────
  // Daily coffee/food
  spendingBatch.push([USER_ID, dayTs(day, randInt(8, 10), randInt(0, 55)),
    rand(4, 7).toFixed(2), "food", pick(["Starbucks", "Local Coffee", "Dunkin"])]);

  // Lunch spending
  if (dr(50) > 0.3) {
    spendingBatch.push([USER_ID, dayTs(day, lunchH, randInt(0, 30)),
      rand(10, 22).toFixed(2), "food", pick(["Chipotle", "Local Deli", "Subway", "Panera", "Sweetgreen"])]);
  }

  // Dinner spending (eating out ~40% of nights)
  if (dr(51) > 0.6) {
    spendingBatch.push([USER_ID, dayTs(day, dinnerH + 1, randInt(0, 30)),
      rand(18, 55).toFixed(2), "food", pick(["Local Restaurant", "DoorDash", "Uber Eats", "Italian Place"])]);
  }

  // Grocery run (weekends mostly)
  if (isWeekend && dr(52) > 0.4) {
    spendingBatch.push([USER_ID, dayTs(day, randInt(10, 14), randInt(0, 45)),
      rand(45, 120).toFixed(2), "food", pick(["Whole Foods", "Trader Joe's", "Costco", "Kroger"])]);
  }

  // Subscriptions (monthly, first of month)
  if (day.getDate() === 1) {
    spendingBatch.push([USER_ID, dayTs(day, 9, 0), "15.99", "subscriptions", "Netflix"]);
    spendingBatch.push([USER_ID, dayTs(day, 9, 1), "9.99", "subscriptions", "Spotify"]);
  }
  if (day.getDate() === 5) {
    spendingBatch.push([USER_ID, dayTs(day, 9, 0), "35.00", "health", "Gym Membership"]);
  }

  // Random misc (30% of days)
  if (dr(53) > 0.7) {
    const cat = pick(spendingCategories.slice(2));
    spendingBatch.push([USER_ID, dayTs(day, randInt(12, 20), randInt(0, 55)),
      pick(cat.amounts).toFixed(2), cat.category, pick(cat.merchants)]);
  }

  // ── METRIC LOGS (water, steps, screen time) ───────────
  const glasses = randInt(4, 9);
  metricLogBatch.push([waterMetric.id, dayTs(day, 21, 30), glasses]);

  const steps = isWeekend ? randInt(6000, 14000) : randInt(4000, 11000);
  metricLogBatch.push([stepsMetric.id, dayTs(day, 22, 0), steps]);

  const screenMin = isWeekend ? randInt(120, 280) : randInt(90, 220);
  metricLogBatch.push([screenMetric.id, dayTs(day, 22, 30), screenMin]);

  // ── HOBBIES ───────────────────────────────────────────
  if (dr(60) > 0.55) { // guitar ~45% of days
    const mins = randInt(15, 60);
    hobbyLogBatch.push([guitar.id, dayTs(day, 19, randInt(0, 45)), mins, randInt(3, 5)]);
  }
  if (dr(61) > 0.65 && !isWeekend) { // running ~35% of weekdays
    const km = parseFloat(rand(3, 8).toFixed(1));
    hobbyLogBatch.push([running.id, dayTs(day, 6, randInt(15, 45)), km, randInt(3, 5)]);
  }
  if (isWeekend && dr(62) > 0.4) { // longer weekend runs
    const km = parseFloat(rand(6, 14).toFixed(1));
    hobbyLogBatch.push([running.id, dayTs(day, 8, randInt(0, 30)), km, randInt(4, 5)]);
  }

  // ── READING LOGS ──────────────────────────────────────
  const activeBook = bookIds.find(b => {
    const s = new Date(b.started_at);
    const e = b.finished_at ? new Date(b.finished_at) : END;
    return day >= s && day <= e;
  });
  if (activeBook && dr(70) > 0.3) {
    const pages = randInt(8, 45);
    readingLogBatch.push([activeBook.id, day.toISOString().slice(0, 10), pages]);
  }

  // ── EXERCISE SESSIONS (3-4x per week) ─────────────────
  if (exercises.length > 0 && dr(80) > 0.55) {
    exerciseBatch.push({ day, dayIdx });
  }
});

// ──────────────────────────────────────────────────────────
// BULK INSERTS
// ──────────────────────────────────────────────────────────

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
  const durationMin = randInt(25, 65);
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
      [session.id, ex.id, randInt(2, 4), randInt(8, 15), parseFloat(rand(20, 80).toFixed(1))]
    );
  }
}

await pool.end();
console.log("✓ Seed complete.");
