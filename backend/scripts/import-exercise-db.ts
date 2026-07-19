// Run once (and re-run to sync updates):
//   npx tsx scripts/import-exercise-db.ts

import { pool } from "../src/db.js";

const SOURCE_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

interface RawExercise {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  images: string[];
}

async function importExercises() {
  console.log("Fetching exercise library from free-exercise-db...");
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const exercises = (await res.json()) as RawExercise[];
  console.log(`Importing ${exercises.length} exercises...`);

  let count = 0;
  for (const ex of exercises) {
    await pool.query(
      `INSERT INTO exercise_library
         (external_id, name, category, equipment, primary_muscles, secondary_muscles, instructions, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (external_id) DO UPDATE SET
         name              = EXCLUDED.name,
         category          = EXCLUDED.category,
         equipment         = EXCLUDED.equipment,
         primary_muscles   = EXCLUDED.primary_muscles,
         secondary_muscles = EXCLUDED.secondary_muscles,
         instructions      = EXCLUDED.instructions,
         images            = EXCLUDED.images`,
      [
        ex.id,
        ex.name,
        ex.category ?? null,
        ex.equipment ?? null,
        ex.primaryMuscles ?? [],
        ex.secondaryMuscles ?? [],
        ex.instructions ?? [],
        ex.images ?? [],
      ]
    );
    count++;
    if (count % 100 === 0) console.log(`  ${count} / ${exercises.length}`);
  }

  console.log(`Done — imported/updated ${exercises.length} exercises.`);
  await pool.end();
}

importExercises().catch((err) => {
  console.error(err);
  process.exit(1);
});
