import { FastifyInstance } from "fastify";
import { query } from "../db.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type Goal = "strength" | "muscle_gain" | "fat_loss" | "endurance" | "general_fitness";
type Experience = "beginner" | "intermediate" | "advanced";

export interface WizardAnswers {
  goal: Goal;
  experience: Experience;
  equipment: string[];       // actual exercise_library.equipment values
  location: string;
  preferred_minutes: number;
  days_per_week: number;
  muscle_focus: string[];    // actual primary_muscles values
  limitations: string[];     // knee_pain | lower_back_pain | shoulder_pain | wrist_pain
}

interface GeneratedExercise {
  exercise_id: string;
  name: string;
  category: string;
  equipment: string | null;
  primary_muscles: string[];
  sets: number;
  rep_range_min: number;
  rep_range_max: number;
}

interface GeneratedDay {
  day_number: number;
  focus: string;
  exercises: GeneratedExercise[];
}

// ── Plan-generation constants ─────────────────────────────────────────────────

const GOAL_PARAMS: Record<Goal, { sets: number; repMin: number; repMax: number }> = {
  strength:        { sets: 5, repMin: 3,  repMax: 5  },
  muscle_gain:     { sets: 4, repMin: 8,  repMax: 12 },
  fat_loss:        { sets: 3, repMin: 12, repMax: 15 },
  endurance:       { sets: 3, repMin: 15, repMax: 20 },
  general_fitness: { sets: 3, repMin: 10, repMax: 12 },
};

const GOAL_CATEGORIES: Record<Goal, string[]> = {
  strength:        ["strength", "powerlifting", "strongman"],
  muscle_gain:     ["strength"],
  fat_loss:        ["strength", "cardio"],
  endurance:       ["cardio", "strength"],
  general_fitness: ["strength"],
};

function exerciseCount(minutes: number): number {
  if (minutes <= 20) return 3;
  if (minutes <= 30) return 4;
  if (minutes <= 45) return 5;
  if (minutes <= 60) return 6;
  return 8;
}

function getSplit(days: number, experience: Experience): string[] {
  if (days <= 2) return ["full_body", "full_body"];
  if (days === 3)
    return experience === "beginner"
      ? ["full_body", "full_body", "full_body"]
      : ["push", "pull", "legs"];
  if (days === 4)
    return experience === "beginner"
      ? ["upper", "lower", "upper", "lower"]
      : ["push", "pull", "legs", "upper"];
  if (days === 5) {
    if (experience === "beginner") return ["upper", "lower", "upper", "lower", "full_body"];
    if (experience === "intermediate") return ["push", "pull", "legs", "upper", "lower"];
    return ["push", "pull", "legs", "push", "pull"];
  }
  // 6+ days
  if (experience === "beginner") return ["upper", "lower", "upper", "lower", "full_body", "full_body"];
  if (experience === "intermediate") return ["push", "pull", "legs", "push", "pull", "full_body"];
  return ["push", "pull", "legs", "push", "pull", "legs"];
}

// focus → primary_muscles to target (empty = any / full body)
const FOCUS_MUSCLES: Record<string, string[]> = {
  push:      ["chest", "shoulders", "triceps"],
  pull:      ["lats", "middle back", "biceps", "traps"],
  legs:      ["quadriceps", "hamstrings", "glutes", "calves"],
  upper:     ["chest", "lats", "shoulders", "biceps", "triceps", "middle back", "traps"],
  lower:     ["quadriceps", "hamstrings", "glutes", "calves", "abductors", "adductors"],
  full_body: [],
};

// limitation key → categories to exclude
const LIMITATION_EXCLUDED_CATS: Record<string, string[]> = {
  knee_pain:       ["plyometrics"],
  lower_back_pain: ["powerlifting", "strongman", "olympic weightlifting"],
  shoulder_pain:   [],
  wrist_pain:      [],
};

// limitation key → primary_muscles to exclude from results
const LIMITATION_EXCLUDED_MUSCLES: Record<string, string[]> = {
  knee_pain:       [],
  lower_back_pain: ["lower back"],
  shoulder_pain:   ["shoulders"],
  wrist_pain:      [],
};

// ── Core generator ────────────────────────────────────────────────────────────

async function generatePlan(answers: WizardAnswers): Promise<GeneratedDay[]> {
  const { goal, experience, equipment, preferred_minutes, days_per_week, muscle_focus, limitations } = answers;
  const params = GOAL_PARAMS[goal];
  const count = exerciseCount(preferred_minutes);
  const split = getSplit(Math.min(days_per_week, 6), experience);
  const goalCats = GOAL_CATEGORIES[goal];

  // Merge limitation exclusions
  const excludedCats = new Set<string>();
  const excludedMuscles = new Set<string>();
  for (const lim of limitations) {
    (LIMITATION_EXCLUDED_CATS[lim] ?? []).forEach((c) => excludedCats.add(c));
    (LIMITATION_EXCLUDED_MUSCLES[lim] ?? []).forEach((m) => excludedMuscles.add(m));
  }

  // Equipment list: always include "body only" as a fallback
  const equipmentWithFallback = Array.from(new Set([...equipment, "body only"]));

  const days: GeneratedDay[] = [];

  for (let i = 0; i < split.length; i++) {
    const focus = split[i];
    const focusMuscles = FOCUS_MUSCLES[focus] ?? [];

    // If user specified a muscle_focus preference AND this day's focus overlaps,
    // narrow to the intersection so their preferences are respected.
    const activeMuscleFilter =
      muscle_focus.length > 0 && focusMuscles.length > 0
        ? focusMuscles.filter((m) => muscle_focus.includes(m))
        : focusMuscles;

    // Use the narrowed list only if it's non-empty; otherwise fall back to full focus
    const muscleFilter = activeMuscleFilter.length > 0 ? activeMuscleFilter : focusMuscles;

    const exercises = await pickExercises({
      equipment: equipmentWithFallback,
      goalCats,
      excludedCats: Array.from(excludedCats),
      excludedMuscles: Array.from(excludedMuscles),
      muscleFilter,
      count,
      params,
    });

    days.push({ day_number: i + 1, focus, exercises });
  }

  return days;
}

interface PickParams {
  equipment: string[];
  goalCats: string[];
  excludedCats: string[];
  excludedMuscles: string[];
  muscleFilter: string[];
  count: number;
  params: { sets: number; repMin: number; repMax: number };
}

async function pickExercises(p: PickParams): Promise<GeneratedExercise[]> {
  const { equipment, goalCats, excludedCats, excludedMuscles, muscleFilter, count, params } = p;

  const rows = await query<any>(
    `SELECT id, name, category, equipment, primary_muscles
     FROM exercise_library
     WHERE
       equipment = ANY($1::text[])
       AND category = ANY($2::text[])
       AND ($3::text[] = '{}' OR category != ALL($3::text[]))
       AND ($4::text[] = '{}' OR NOT (primary_muscles && $4::text[]))
       AND ($5::text[] = '{}' OR primary_muscles && $5::text[])
     ORDER BY RANDOM()
     LIMIT $6`,
    [
      equipment,
      goalCats,
      excludedCats.length ? excludedCats : [],
      excludedMuscles.length ? excludedMuscles : [],
      muscleFilter.length ? muscleFilter : [],
      count * 3,  // fetch 3× so we can deduplicate across days later if needed
    ]
  );

  // Deduplicate by id, take the first `count`
  const seen = new Set<string>();
  const selected: GeneratedExercise[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    selected.push({
      exercise_id: r.id,
      name: r.name,
      category: r.category,
      equipment: r.equipment,
      primary_muscles: r.primary_muscles ?? [],
      sets: params.sets,
      rep_range_min: params.repMin,
      rep_range_max: params.repMax,
    });
    if (selected.length >= count) break;
  }

  // If we didn't get enough, relax the muscle filter and try again
  if (selected.length < count && muscleFilter.length > 0) {
    const fallback = await query<any>(
      `SELECT id, name, category, equipment, primary_muscles
       FROM exercise_library
       WHERE
         equipment = ANY($1::text[])
         AND category = ANY($2::text[])
         AND ($3::text[] = '{}' OR category != ALL($3::text[]))
         AND ($4::text[] = '{}' OR NOT (primary_muscles && $4::text[]))
         AND id != ALL($5::uuid[])
       ORDER BY RANDOM()
       LIMIT $6`,
      [
        equipment,
        goalCats,
        excludedCats.length ? excludedCats : [],
        excludedMuscles.length ? excludedMuscles : [],
        selected.map((e) => e.exercise_id),
        count - selected.length,
      ]
    );
    for (const r of fallback) {
      selected.push({
        exercise_id: r.id,
        name: r.name,
        category: r.category,
        equipment: r.equipment,
        primary_muscles: r.primary_muscles ?? [],
        sets: params.sets,
        rep_range_min: params.repMin,
        rep_range_max: params.repMax,
      });
      if (selected.length >= count) break;
    }
  }

  return selected;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export default async function programRoutes(app: FastifyInstance) {
  // GET /api/exercise/wizard/status
  // Returns whether the user has completed setup and their active program if any.
  app.get("/wizard/status", async (req) => {
    const user_id = req.user_id;
    const [settingsRows, programRows] = await Promise.all([
      query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]),
      query<any>(
        `SELECT id, name, goal, experience_level, days_per_week, preferred_minutes,
                equipment, muscle_focus, limitations, created_at
         FROM workout_programs WHERE user_id = $1 AND is_active = true
         ORDER BY created_at DESC LIMIT 1`,
        [user_id]
      ),
    ]);
    const settings = settingsRows[0]?.settings ?? {};
    return {
      complete: settings.workout_setup_complete === true,
      program: programRows[0] ?? null,
    };
  });

  // POST /api/exercise/wizard/generate
  // Pure preview — does NOT persist anything. Returns the generated day list.
  app.post("/wizard/generate", async (req) => {
    const answers = req.body as WizardAnswers;
    const days = await generatePlan(answers);
    return { days };
  });

  // POST /api/exercise/wizard/accept
  // Saves the generated plan, marks setup complete.
  app.post("/wizard/accept", async (req) => {
    const user_id = req.user_id;
    const { answers, days } = req.body as { answers: WizardAnswers; days: GeneratedDay[] };

    const goalLabels: Record<Goal, string> = {
      strength:        "Strength",
      muscle_gain:     "Muscle Gain",
      fat_loss:        "Fat Loss",
      endurance:       "Endurance",
      general_fitness: "General Fitness",
    };
    const name = `${goalLabels[answers.goal] ?? "My"} Plan — ${answers.days_per_week}×/week`;

    // Insert program
    const progRows = await query<any>(
      `INSERT INTO workout_programs
         (user_id, name, goal, experience_level, days_per_week, preferred_minutes,
          equipment, muscle_focus, location, limitations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        user_id, name, answers.goal, answers.experience,
        answers.days_per_week, answers.preferred_minutes,
        answers.equipment, answers.muscle_focus,
        answers.location, answers.limitations,
      ]
    );
    const programId = progRows[0].id;

    // Insert days + exercises
    for (const day of days) {
      const dayRows = await query<any>(
        `INSERT INTO workout_program_days (program_id, day_number, focus)
         VALUES ($1,$2,$3) RETURNING id`,
        [programId, day.day_number, day.focus]
      );
      const dayId = dayRows[0].id;
      for (let j = 0; j < day.exercises.length; j++) {
        const ex = day.exercises[j];
        await query(
          `INSERT INTO workout_program_exercises
             (day_id, exercise_id, sets, rep_range_min, rep_range_max, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [dayId, ex.exercise_id, ex.sets, ex.rep_range_min, ex.rep_range_max, j]
        );
      }
    }

    // Mark setup complete in user_settings
    const settingsRows = await query<any>(
      "SELECT settings FROM user_settings WHERE user_id = $1", [user_id]
    );
    const existing = settingsRows[0]?.settings ?? {};
    const merged = { ...existing, workout_setup_complete: true };
    await query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1,$2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb`,
      [user_id, JSON.stringify(merged)]
    );

    return { ok: true, program_id: programId };
  });

  // POST /api/exercise/wizard/skip
  // Marks setup complete without creating a program (build-from-scratch path).
  app.post("/wizard/skip", async (req) => {
    const user_id = req.user_id;
    const settingsRows = await query<any>(
      "SELECT settings FROM user_settings WHERE user_id = $1", [user_id]
    );
    const existing = settingsRows[0]?.settings ?? {};
    const merged = { ...existing, workout_setup_complete: true };
    await query(
      `INSERT INTO user_settings (user_id, settings) VALUES ($1,$2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb`,
      [user_id, JSON.stringify(merged)]
    );
    return { ok: true };
  });

  // GET /api/exercise/programs
  // List user's programs (most recent first).
  app.get("/programs", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>(
      `SELECT p.id, p.name, p.goal, p.experience_level, p.days_per_week,
              p.preferred_minutes, p.equipment, p.muscle_focus, p.limitations,
              p.is_active, p.created_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', d.id, 'day_number', d.day_number, 'focus', d.focus,
                    'exercises', (
                      SELECT json_agg(
                        json_build_object(
                          'exercise_id', pe.exercise_id,
                          'name', el.name, 'sets', pe.sets,
                          'rep_range_min', pe.rep_range_min,
                          'rep_range_max', pe.rep_range_max,
                          'sort_order', pe.sort_order
                        ) ORDER BY pe.sort_order
                      )
                      FROM workout_program_exercises pe
                      JOIN exercise_library el ON el.id = pe.exercise_id
                      WHERE pe.day_id = d.id
                    )
                  ) ORDER BY d.day_number
                ) FILTER (WHERE d.id IS NOT NULL),
                '[]'
              ) AS days
       FROM workout_programs p
       LEFT JOIN workout_program_days d ON d.program_id = p.id
       WHERE p.user_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [user_id]
    );
    return rows;
  });
}
