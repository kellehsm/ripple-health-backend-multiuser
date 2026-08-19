/**
 * Seed missing data for friend accounts (maya, jordan, sam) up to Jul 27 2026
 * Adds: sleep, meals, journal, heart rate, missing hobby logs, missing exercise,
 *       current books — without touching existing steps metric logs or prior data.
 */

import pg from "pg";

const DATABASE_URL = "postgres://wellness_user:Sherl0cked12@@@localhost:5432/wellness_multiuser";
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const q = (sql, params) => pool.query(sql, params);

const FRIENDS = [
  {
    id:       "aaaa0001-0000-0000-0000-000000000001",
    name:     "maya",
    hobbyId:  "cccc0001-0000-0000-0000-000000000001", // Running (miles)
    hobbyKey: "running",
    hasExercise: true,   // already has through Jul 24
    hasSleep:    false,
    sleepStart:  new Date("2026-07-01T00:00:00-05:00"),
    hobbyGap:    new Date("2026-07-25T00:00:00-05:00"), // logs missing from here
    exerciseGap: new Date("2026-07-25T00:00:00-05:00"),
    currentBook: { title: "What I Talk About When I Talk About Running", author: "Haruki Murakami", pages: 192, started: "2026-07-22" },
    restingHR: 54,  // fit runner
    journalTexts: [
      "Long run this morning — legs felt strong after yesterday's rest.",
      "Hit a new weekly mileage PR. The consistency is paying off.",
      "Easy recovery run today. Keeping the heart rate low.",
      "Trail run after work — so much better than roads.",
      "Rest day. Stretched, rolled out, feeling good.",
      "Morning run in the rain. Honestly one of my favorites.",
      "Steps are stacking up. Feeling on top of my training.",
      "Good sleep last night made today's run feel effortless.",
    ],
  },
  {
    id:       "aaaa0002-0000-0000-0000-000000000002",
    name:     "jordan",
    hobbyId:  "cccc0002-0000-0000-0000-000000000002", // Guitar (hours)
    hobbyKey: "guitar",
    hasExercise: false,  // none at all
    hasSleep:    true,   // has through Jul 24
    sleepStart:  new Date("2026-07-25T00:00:00-05:00"),
    hobbyGap:    new Date("2026-07-24T00:00:00-05:00"),
    exerciseGap: new Date("2026-07-01T00:00:00-05:00"),
    currentBook: { title: "Project Hail Mary", author: "Andy Weir", pages: 476, started: "2026-07-24" },
    restingHR: 68,
    journalTexts: [
      "Good practice session tonight — finally nailed that chord transition.",
      "Read for a couple hours before bed. Love getting lost in a good story.",
      "Quiet day. Guitar, coffee, book. Ideal Sunday.",
      "Walked around the neighborhood and listened to a podcast. Simple but good.",
      "Trying to build more of a routine. Small steps.",
      "Finished The Midnight Library — what a read. Starting something new tomorrow.",
      "Guitar is coming along. Starting to sound like music instead of noise.",
      "Feeling calm and settled this week. Good rhythm going.",
    ],
  },
  {
    id:       "aaaa0003-0000-0000-0000-000000000003",
    name:     "sam",
    hobbyId:  "cccc0003-0000-0000-0000-000000000003", // Photography (shoots)
    hobbyKey: "photography",
    hasExercise: true,   // already has through Jul 24
    hasSleep:    false,
    sleepStart:  new Date("2026-07-01T00:00:00-05:00"),
    hobbyGap:    new Date("2026-07-24T00:00:00-05:00"),
    exerciseGap: new Date("2026-07-25T00:00:00-05:00"),
    currentBook: { title: "Atomic Habits", author: "James Clear", pages: 320, started: "2026-07-21" },
    restingHR: 58,  // fit lifter
    journalTexts: [
      "Crushed leg day. PR on squats.",
      "Upper body session felt strong. Recovery is on point.",
      "Rest day but got 14k steps just from walking around. Body feels good.",
      "Took some great shots at golden hour. Light was perfect.",
      "Meal prepped and ready for the week. Big lift tomorrow.",
      "Pushed hard today — deadlifts, rows, farmers carry. Earned the rest.",
      "Step count through the roof today. Active recovery is underrated.",
      "Good training week overall. Consistent and progressive.",
    ],
  },
];

const END = new Date("2026-07-27T23:59:00-05:00");
const MEAL_START = new Date("2026-07-01T00:00:00-05:00");

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.round(rand(min, max)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function dayRand(seed, dayOffset, salt) {
  const x = Math.sin(seed * 17.3 + dayOffset * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function eachDay(start, fn) {
  const d = new Date(start);
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

const breakfasts = [
  { name: "Oatmeal with berries", carbs_g: 45, sugar_g: 12, calories: 320, caffeine_mg: 0 },
  { name: "Scrambled eggs & toast", carbs_g: 28, sugar_g: 3, calories: 380, caffeine_mg: 0 },
  { name: "Greek yogurt & granola", carbs_g: 52, sugar_g: 18, calories: 420, caffeine_mg: 0 },
  { name: "Avocado toast", carbs_g: 32, sugar_g: 2, calories: 350, caffeine_mg: 0 },
  { name: "Protein smoothie", carbs_g: 44, sugar_g: 18, calories: 390, caffeine_mg: 0 },
  { name: "Banana & peanut butter", carbs_g: 40, sugar_g: 16, calories: 310, caffeine_mg: 0 },
];
const lunches = [
  { name: "Grilled chicken salad", carbs_g: 18, sugar_g: 4, calories: 420, caffeine_mg: 0 },
  { name: "Turkey & avocado wrap", carbs_g: 45, sugar_g: 5, calories: 520, caffeine_mg: 0 },
  { name: "Quinoa bowl", carbs_g: 52, sugar_g: 6, calories: 480, caffeine_mg: 0 },
  { name: "Tuna sandwich", carbs_g: 38, sugar_g: 4, calories: 490, caffeine_mg: 0 },
  { name: "Burrito bowl", carbs_g: 65, sugar_g: 6, calories: 580, caffeine_mg: 0 },
  { name: "Lentil soup & bread", carbs_g: 60, sugar_g: 8, calories: 440, caffeine_mg: 0 },
];
const dinners = [
  { name: "Salmon & roasted vegetables", carbs_g: 22, sugar_g: 8, calories: 520, caffeine_mg: 0 },
  { name: "Chicken stir fry with rice", carbs_g: 68, sugar_g: 10, calories: 610, caffeine_mg: 0 },
  { name: "Pasta with marinara", carbs_g: 78, sugar_g: 12, calories: 580, caffeine_mg: 0 },
  { name: "Grilled steak & sweet potato", carbs_g: 35, sugar_g: 9, calories: 640, caffeine_mg: 0 },
  { name: "Veggie curry & rice", carbs_g: 72, sugar_g: 14, calories: 540, caffeine_mg: 0 },
  { name: "Turkey meatballs & zucchini", carbs_g: 20, sugar_g: 6, calories: 490, caffeine_mg: 0 },
];
const snacks = [
  { name: "Coffee", carbs_g: 2, sugar_g: 0, calories: 5, caffeine_mg: 120 },
  { name: "Apple", carbs_g: 25, sugar_g: 19, calories: 95, caffeine_mg: 0 },
  { name: "Almonds", carbs_g: 6, sugar_g: 1, calories: 160, caffeine_mg: 0 },
  { name: "Protein bar", carbs_g: 28, sugar_g: 10, calories: 210, caffeine_mg: 0 },
];
const moodLabels = ["terrible", "rough", "okay", "good", "great"];

const { rows: exercises } = await q("SELECT id FROM exercise_library LIMIT 20");

for (const friend of FRIENDS) {
  const seed = friend.id.charCodeAt(3); // unique per friend
  console.log(`\nSeeding ${friend.name}…`);

  // ── ADD CURRENT BOOK ────────────────────────────────────
  const { rows: existingBooks } = await q(
    "SELECT id FROM books WHERE user_id=$1 AND status='reading'", [friend.id]);
  if (existingBooks.length === 0) {
    await q(
      `INSERT INTO books (user_id, title, author, total_pages, status, rating, started_at)
       VALUES ($1,$2,$3,$4,'reading',null,$5)`,
      [friend.id, friend.currentBook.title, friend.currentBook.author,
       friend.currentBook.pages, friend.currentBook.started]
    );
    console.log(`  Added current book: ${friend.currentBook.title}`);
  }

  // ── SLEEP ────────────────────────────────────────────────
  let sleepAdded = 0;
  eachDay(friend.sleepStart, (day, dayIdx) => {
    const dr = (s) => dayRand(seed, dayIdx, s);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const sleepHours = isWeekend ? rand(7.5, 9.2) : rand(6.5, 8.2);
    const wakeH = isWeekend ? randInt(7, 9) : randInt(6, 7);
    const wake = new Date(day);
    wake.setHours(wakeH, randInt(0, 55), 0, 0);
    const sleepStart = new Date(wake.getTime() - sleepHours * 3600 * 1000);
    pool.query(
      `INSERT INTO sleep_sessions (user_id,start_time,end_time,quality_score) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [friend.id, sleepStart.toISOString(), wake.toISOString(), randInt(3, 5)]
    );
    sleepAdded++;
  });
  console.log(`  Queued ${sleepAdded} sleep sessions`);

  // ── MEALS ───────────────────────────────────────────────
  let mealBatch = [];
  eachDay(MEAL_START, (day, dayIdx) => {
    const dr = (s) => dayRand(seed, dayIdx, s);
    const wakeH = day.getDay() === 0 || day.getDay() === 6 ? randInt(7, 9) : randInt(6, 7);
    const lunchH = 12 + randInt(-1, 1);
    const dinnerH = 18 + randInt(-1, 2);
    const bf = pick(breakfasts);
    mealBatch.push([friend.id, dayTs(day, wakeH + 1, randInt(0, 30)), bf.name, "breakfast", bf.carbs_g, bf.sugar_g, bf.calories, bf.caffeine_mg]);
    if (dr(11) > 0.5) {
      mealBatch.push([friend.id, dayTs(day, wakeH + 1, 45), snacks[0].name, "snack", snacks[0].carbs_g, snacks[0].sugar_g, snacks[0].calories, snacks[0].caffeine_mg]);
    }
    const lu = pick(lunches);
    mealBatch.push([friend.id, dayTs(day, lunchH, randInt(0, 45)), lu.name, "lunch", lu.carbs_g, lu.sugar_g, lu.calories, lu.caffeine_mg]);
    if (dr(12) > 0.5) {
      const sn = snacks[randInt(1, 3)];
      mealBatch.push([friend.id, dayTs(day, 15, randInt(0, 45)), sn.name, "snack", sn.carbs_g, sn.sugar_g, sn.calories, sn.caffeine_mg]);
    }
    const di = pick(dinners);
    mealBatch.push([friend.id, dayTs(day, dinnerH, randInt(0, 40)), di.name, "dinner", di.carbs_g, di.sugar_g, di.calories, di.caffeine_mg]);
  });
  for (let i = 0; i < mealBatch.length; i += 200) {
    const chunk = mealBatch.slice(i, i + 200);
    const vals = chunk.map((_, j) => `($${j*8+1},$${j*8+2},$${j*8+3},$${j*8+4},$${j*8+5},$${j*8+6},$${j*8+7},$${j*8+8})`).join(",");
    await q(`INSERT INTO meals (user_id,logged_at,name,meal_type,carbs_g,sugar_g,calories,caffeine_mg) VALUES ${vals}`, chunk.flat());
  }
  console.log(`  Added ${mealBatch.length} meals`);

  // ── JOURNAL ─────────────────────────────────────────────
  let journalCount = 0;
  eachDay(MEAL_START, (day, dayIdx) => {
    const dr = (s) => dayRand(seed, dayIdx, s);
    if (dr(40) > 0.3) {
      const mood = clamp(3 + Math.round((dr(41) - 0.3) * 2), 1, 5);
      const text = dr(42) > 0.4 ? pick(friend.journalTexts) : null;
      pool.query(
        `INSERT INTO journal_entries (user_id,logged_at,mood_score,mood_label,entry_text,entry_type) VALUES ($1,$2,$3,$4,$5,'journal')`,
        [friend.id, dayTs(day, 21, randInt(0, 45)), mood, moodLabels[mood - 1], text]
      );
      journalCount++;
    }
  });
  console.log(`  Queued ~${journalCount} journal entries`);

  // ── HEART RATE ──────────────────────────────────────────
  let hrBatch = [];
  eachDay(MEAL_START, (day, dayIdx) => {
    const dr = (s) => dayRand(seed, dayIdx, s);
    const wakeH = day.getDay() === 0 || day.getDay() === 6 ? randInt(7, 9) : randInt(6, 7);
    const count = randInt(5, 10);
    for (let i = 0; i < count; i++) {
      const h = randInt(wakeH, 21);
      const isExercise = h >= 6 && h <= 8 && friend.name === "maya" && dr(30 + i) > 0.4;
      const isLift = h >= 17 && h <= 20 && friend.name === "sam" && dr(30 + i) > 0.4;
      let bpm = randInt(friend.restingHR - 5, friend.restingHR + 10);
      if (isExercise) bpm = randInt(145, 175);
      if (isLift) bpm = randInt(130, 165);
      hrBatch.push([friend.id, dayTs(day, h, randInt(0, 55)), clamp(bpm, 45, 185)]);
    }
  });
  for (let i = 0; i < hrBatch.length; i += 500) {
    const chunk = hrBatch.slice(i, i + 500);
    const vals = chunk.map((_, j) => `($${j*3+1},$${j*3+2},$${j*3+3})`).join(",");
    await q(`INSERT INTO heart_rate_readings (user_id,recorded_at,bpm) VALUES ${vals} ON CONFLICT DO NOTHING`, chunk.flat());
  }
  console.log(`  Added ${hrBatch.length} heart rate readings`);

  // ── HOBBY LOGS (missing days only) ───────────────────────
  let hobbyAdded = 0;
  eachDay(friend.hobbyGap, (day, dayIdx) => {
    const dr = (s) => dayRand(seed, dayIdx, s);
    if (friend.hobbyKey === "running" && dr(60) > 0.4) {
      const miles = parseFloat(rand(2, 8).toFixed(1));
      pool.query(`INSERT INTO hobby_logs (hobby_id,logged_at,amount,rating) VALUES ($1,$2,$3,$4)`,
        [friend.hobbyId, dayTs(day, 6, randInt(0, 45)), miles, randInt(3, 5)]);
      hobbyAdded++;
    } else if (friend.hobbyKey === "guitar" && dr(60) > 0.45) {
      const hrs = parseFloat(rand(0.5, 2).toFixed(1));
      pool.query(`INSERT INTO hobby_logs (hobby_id,logged_at,amount,rating) VALUES ($1,$2,$3,$4)`,
        [friend.hobbyId, dayTs(day, 20, randInt(0, 45)), hrs, randInt(3, 5)]);
      hobbyAdded++;
    } else if (friend.hobbyKey === "photography" && dr(60) > 0.6) {
      pool.query(`INSERT INTO hobby_logs (hobby_id,logged_at,amount,rating) VALUES ($1,$2,$3,$4)`,
        [friend.hobbyId, dayTs(day, 17, randInt(0, 45)), 1, randInt(3, 5)]);
      hobbyAdded++;
    }
  });
  console.log(`  Queued ${hobbyAdded} new hobby logs`);

  // ── READING LOGS (for current book) ──────────────────────
  const { rows: currentBooks } = await q(
    "SELECT id, started_at FROM books WHERE user_id=$1 AND status='reading'", [friend.id]);
  for (const book of currentBooks) {
    const bookStart = new Date(book.started_at);
    let readingAdded = 0;
    eachDay(bookStart, (day, dayIdx) => {
      const dr = (s) => dayRand(seed, dayIdx + 99, s);
      if (dr(70) > 0.35) {
        pool.query(`INSERT INTO reading_logs (book_id,logged_at,pages_read) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [book.id, day.toISOString().slice(0, 10), randInt(12, 45)]);
        readingAdded++;
      }
    });
    console.log(`  Queued ${readingAdded} reading log entries`);
  }

  // ── EXERCISE (missing days) ───────────────────────────────
  let exerciseAdded = 0;
  eachDay(friend.exerciseGap, (day, dayIdx) => {
    const dr = (s) => dayRand(seed, dayIdx, s);
    // maya and sam: ~4x/week; jordan: ~3x/week
    const threshold = friend.name === "jordan" ? 0.6 : 0.5;
    if (exercises.length > 0 && dr(80) > threshold) {
      const h = friend.name === "maya" ? randInt(6, 8) :
                friend.name === "sam"  ? randInt(17, 20) : randInt(7, 19);
      const start = new Date(day);
      start.setHours(h, randInt(0, 45), 0, 0);
      const dur = randInt(30, 60);
      const end = new Date(start.getTime() + dur * 60000);
      q(`INSERT INTO exercise_sessions (user_id,started_at,ended_at) VALUES ($1,$2,$3) RETURNING id`,
        [friend.id, start.toISOString(), end.toISOString()]
      ).then(({ rows: [sess] }) => {
        const exCount = randInt(2, 5);
        for (let e = 0; e < exCount; e++) {
          const ex = exercises[randInt(0, exercises.length - 1)];
          q(`INSERT INTO exercise_log_entries (session_id,exercise_id,sets,reps,weight_used) VALUES ($1,$2,$3,$4,$5)`,
            [sess.id, ex.id, randInt(2, 4), randInt(8, 15), parseFloat(rand(20, 90).toFixed(1))]);
        }
      });
      exerciseAdded++;
    }
  });
  console.log(`  Queued ${exerciseAdded} exercise sessions`);
}

// Give async fire-and-forget queries a moment to flush
await new Promise(r => setTimeout(r, 3000));
await pool.end();
console.log("\n✓ All friends seeded.");
