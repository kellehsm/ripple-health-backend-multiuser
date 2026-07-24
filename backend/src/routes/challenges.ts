import { FastifyInstance } from "fastify";
import { query } from "../db.js";

// Only these categories are permitted — privacy boundary
const ALLOWED_CATEGORIES = new Set(["steps", "exercise", "hobbies", "books"]);

// Compute a user's progress for a given category scoped to a date range.
// Returns a numeric value: steps sum, exercise count, hobbies sum, books count.
async function computeProgress(
  user_id: string,
  category: string,
  start_date: string,
  end_date: string
): Promise<number> {
  if (category === "steps") {
    const rows = await query<any>(
      `SELECT COALESCE(SUM(ml.value), 0)::numeric AS value
       FROM metrics m
       JOIN metric_logs ml ON ml.metric_id = m.id
       WHERE m.user_id = $1
         AND m.name = 'steps'
         AND ml.logged_at::date >= $2
         AND ml.logged_at::date <= $3`,
      [user_id, start_date, end_date]
    );
    return Number(rows[0]?.value ?? 0);
  }
  if (category === "exercise") {
    const rows = await query<any>(
      `SELECT COUNT(*)::numeric AS value
       FROM exercise_sessions
       WHERE user_id = $1
         AND started_at::date >= $2
         AND started_at::date <= $3`,
      [user_id, start_date, end_date]
    );
    return Number(rows[0]?.value ?? 0);
  }
  if (category === "hobbies") {
    const rows = await query<any>(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS value
       FROM hobby_logs
       WHERE user_id = $1
         AND logged_at::date >= $2
         AND logged_at::date <= $3`,
      [user_id, start_date, end_date]
    );
    return Number(rows[0]?.value ?? 0);
  }
  if (category === "books") {
    const rows = await query<any>(
      `SELECT COUNT(*)::numeric AS value
       FROM books
       WHERE user_id = $1
         AND status = 'finished'
         AND finished_at >= $2
         AND finished_at <= $3`,
      [user_id, start_date, end_date]
    );
    return Number(rows[0]?.value ?? 0);
  }
  return 0;
}

export default async function challengesRoutes(app: FastifyInstance) {

  // GET / — list challenges I'm a participant in or created
  app.get("/", async (req) => {
    const me = req.user_id;

    const challenges = await query<any>(
      `SELECT DISTINCT ON (c.id)
         c.id, c.title, c.category, c.goal_description, c.goal_value,
         c.start_date, c.end_date, c.status,
         (c.created_by = $1) AS created_by_me,
         (SELECT COUNT(*) FROM challenge_participants cp2 WHERE cp2.challenge_id = c.id)::int AS participant_count
       FROM challenges c
       LEFT JOIN challenge_participants cp ON cp.challenge_id = c.id AND cp.user_id = $1
       WHERE c.created_by = $1 OR cp.user_id = $1
       ORDER BY c.id, c.created_at DESC`,
      [me]
    );

    // Attach my_progress for each challenge
    const result = await Promise.all(
      challenges.map(async (c: any) => {
        const my_progress = await computeProgress(
          me,
          c.category,
          c.start_date instanceof Date
            ? c.start_date.toISOString().slice(0, 10)
            : String(c.start_date).slice(0, 10),
          c.end_date instanceof Date
            ? c.end_date.toISOString().slice(0, 10)
            : String(c.end_date).slice(0, 10)
        );
        return { ...c, my_progress };
      })
    );

    return result;
  });

  // POST / — create a challenge and add participants
  app.post("/", async (req, reply) => {
    const me = req.user_id;
    const {
      title,
      category,
      goal_description,
      goal_value,
      start_date,
      end_date,
      friend_ids = [],
    } = req.body as any;

    if (!title || !category || !goal_description || !start_date || !end_date) {
      return reply.status(400).send({ error: "title, category, goal_description, start_date, end_date are required" });
    }
    if (!ALLOWED_CATEGORIES.has(category)) {
      return reply.status(400).send({ error: "category must be one of: steps, exercise, hobbies, books" });
    }
    if (!Array.isArray(friend_ids)) {
      return reply.status(400).send({ error: "friend_ids must be an array" });
    }

    // Verify friend_ids are all accepted friends of mine
    if (friend_ids.length > 0) {
      const friendCheck = await query<any>(
        `SELECT
           CASE WHEN user_id_a = $1 THEN user_id_b ELSE user_id_a END AS friend_id
         FROM friend_connections
         WHERE (user_id_a = $1 OR user_id_b = $1)
           AND status = 'accepted'`,
        [me]
      );
      const acceptedFriendSet = new Set(friendCheck.map((r: any) => r.friend_id));
      for (const fid of friend_ids) {
        if (!acceptedFriendSet.has(fid)) {
          return reply.status(400).send({ error: `User ${fid} is not an accepted friend` });
        }
      }
    }

    // Create challenge
    const chalRows = await query<any>(
      `INSERT INTO challenges (created_by, title, category, goal_description, goal_value, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, category, goal_description, goal_value, start_date, end_date, status, created_at`,
      [me, title, category, goal_description, goal_value ?? null, start_date, end_date]
    );
    const challenge = chalRows[0];

    // Add creator as participant
    await query(
      `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [challenge.id, me]
    );

    // Add friend participants
    for (const fid of friend_ids) {
      await query(
        `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [challenge.id, fid]
      );
    }

    return reply.status(201).send(challenge);
  });

  // GET /:id — challenge detail + participants with progress
  app.get("/:id", async (req, reply) => {
    const me = req.user_id;
    const { id } = req.params as any;

    // Must be participant or creator
    const chalRows = await query<any>(
      `SELECT c.*
       FROM challenges c
       LEFT JOIN challenge_participants cp ON cp.challenge_id = c.id AND cp.user_id = $1
       WHERE c.id = $2
         AND (c.created_by = $1 OR cp.user_id = $1)`,
      [me, id]
    );
    if (!chalRows[0]) {
      return reply.status(404).send({ error: "Challenge not found or access denied" });
    }
    const challenge = chalRows[0];

    const startStr: string = challenge.start_date instanceof Date
      ? challenge.start_date.toISOString().slice(0, 10)
      : String(challenge.start_date).slice(0, 10);
    const endStr: string = challenge.end_date instanceof Date
      ? challenge.end_date.toISOString().slice(0, 10)
      : String(challenge.end_date).slice(0, 10);

    // Get participants
    const participants = await query<any>(
      `SELECT cp.user_id, u.email, u.username, cp.joined_at
       FROM challenge_participants cp
       JOIN users u ON u.id = cp.user_id
       WHERE cp.challenge_id = $1
       ORDER BY cp.joined_at`,
      [id]
    );

    // Compute progress for each participant
    const participantsWithProgress = await Promise.all(
      participants.map(async (p: any) => {
        const progress = await computeProgress(p.user_id, challenge.category, startStr, endStr);
        return {
          user_id: p.user_id,
          display_name: p.username ?? p.email,
          email: p.email,
          username: p.username,
          joined_at: p.joined_at,
          progress,
          is_me: p.user_id === me,
        };
      })
    );

    return {
      id: challenge.id,
      title: challenge.title,
      category: challenge.category,
      goal_description: challenge.goal_description,
      goal_value: challenge.goal_value,
      start_date: startStr,
      end_date: endStr,
      status: challenge.status,
      created_by: challenge.created_by,
      created_by_me: challenge.created_by === me,
      created_at: challenge.created_at,
      participants: participantsWithProgress,
    };
  });

  // POST /:id/join — join a challenge
  app.post("/:id/join", async (req, reply) => {
    const me = req.user_id;
    const { id } = req.params as any;

    // Verify challenge exists and is active
    const chalRows = await query<any>(
      `SELECT id, status FROM challenges WHERE id = $1`,
      [id]
    );
    if (!chalRows[0]) {
      return reply.status(404).send({ error: "Challenge not found" });
    }
    if (chalRows[0].status !== "active") {
      return reply.status(400).send({ error: "Challenge is not active" });
    }

    // Check if already a participant
    const existing = await query<any>(
      `SELECT id FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2`,
      [id, me]
    );
    if (existing[0]) {
      return reply.status(409).send({ error: "Already a participant" });
    }

    await query(
      `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2)`,
      [id, me]
    );
    return { ok: true };
  });

  // POST /:id/leave — leave a challenge (creator can cancel instead)
  app.post("/:id/leave", async (req, reply) => {
    const me = req.user_id;
    const { id } = req.params as any;

    const chalRows = await query<any>(
      `SELECT id, created_by, status FROM challenges WHERE id = $1`,
      [id]
    );
    if (!chalRows[0]) {
      return reply.status(404).send({ error: "Challenge not found" });
    }

    if (chalRows[0].created_by === me) {
      // Creator can't leave — they cancel the challenge
      await query(
        `UPDATE challenges SET status = 'cancelled' WHERE id = $1`,
        [id]
      );
      return { ok: true, cancelled: true };
    }

    const deleted = await query<any>(
      `DELETE FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2 RETURNING id`,
      [id, me]
    );
    if (!deleted[0]) {
      return reply.status(404).send({ error: "You are not a participant" });
    }
    return { ok: true };
  });
}
