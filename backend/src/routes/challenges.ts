import { FastifyInstance } from "fastify";
import { pool, query } from "../db.js";

// Only these categories are permitted — privacy boundary
const ALLOWED_CATEGORIES = new Set(["steps", "exercise", "hobbies", "books"]);

// Batch-compute progress for a list of {userId, challengeId} entries all sharing the
// same category and date range. Returns a Map keyed by "challengeId:userId".
async function computeProgressBatch(
  entries: Array<{ userId: string; challengeId: string }>,
  category: string,
  start_date: string,
  end_date: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (entries.length === 0) return result;

  const userIds = entries.map(e => e.userId);

  let rows: Array<{ user_id: string; value: string }> = [];

  if (category === "steps") {
    rows = await query<any>(
      `SELECT m.user_id, COALESCE(SUM(ml.value), 0)::numeric AS value
       FROM metrics m
       JOIN metric_logs ml ON ml.metric_id = m.id
       WHERE m.user_id = ANY($1::uuid[])
         AND m.name = 'steps'
         AND ml.logged_at::date >= $2
         AND ml.logged_at::date <= $3
       GROUP BY m.user_id`,
      [userIds, start_date, end_date]
    );
  } else if (category === "exercise") {
    rows = await query<any>(
      `SELECT user_id, COUNT(*)::numeric AS value
       FROM exercise_sessions
       WHERE user_id = ANY($1::uuid[])
         AND started_at::date >= $2
         AND started_at::date <= $3
       GROUP BY user_id`,
      [userIds, start_date, end_date]
    );
  } else if (category === "hobbies") {
    rows = await query<any>(
      `SELECT user_id, COALESCE(SUM(amount), 0)::numeric AS value
       FROM hobby_logs
       WHERE user_id = ANY($1::uuid[])
         AND logged_at::date >= $2
         AND logged_at::date <= $3
       GROUP BY user_id`,
      [userIds, start_date, end_date]
    );
  } else if (category === "books") {
    rows = await query<any>(
      `SELECT user_id, COUNT(*)::numeric AS value
       FROM books
       WHERE user_id = ANY($1::uuid[])
         AND status = 'finished'
         AND finished_at >= $2::date
         AND finished_at < ($3::date + INTERVAL '1 day')
       GROUP BY user_id`,
      [userIds, start_date, end_date]
    );
  }

  // Build a per-user value map
  const valueByUser = new Map<string, number>();
  for (const row of rows) {
    valueByUser.set(row.user_id, Number(row.value));
  }

  // Map each entry to its result
  for (const e of entries) {
    result.set(`${e.challengeId}:${e.userId}`, valueByUser.get(e.userId) ?? 0);
  }
  return result;
}

const CHALLENGE_TEMPLATES = [
  { id: "tpl_steps_7",       title: "7-Day Step Surge",      description: "Hit 8,000 steps every day for a week.",                    metric: "steps",       goal: 8000, duration_days: 7,  icon: "walk-outline",    difficulty: "easy"   },
  { id: "tpl_hydration_7",   title: "Hydration Week",        description: "Log at least 8 glasses of water daily for 7 days.",         metric: "water",       goal: 8,    duration_days: 7,  icon: "water-outline",   difficulty: "easy"   },
  { id: "tpl_mindfulness_14",title: "Mindful Fortnight",     description: "Complete a mindfulness session every day for 2 weeks.",     metric: "mindfulness", goal: 1,    duration_days: 14, icon: "leaf-outline",    difficulty: "medium" },
  { id: "tpl_nospend_7",     title: "No-Spend Week",         description: "Log zero discretionary spending for 7 days.",               metric: "spending",    goal: 0,    duration_days: 7,  icon: "wallet-outline",  difficulty: "hard"   },
  { id: "tpl_steps_30",      title: "30-Day Step Streak",    description: "Log at least 5,000 steps every day for a month.",           metric: "steps",       goal: 5000, duration_days: 30, icon: "fitness-outline", difficulty: "hard"   },
  { id: "tpl_sleep_14",      title: "Sleep Reset",           description: "Get 7+ hours of sleep for 14 consecutive days.",            metric: "sleep",       goal: 420,  duration_days: 14, icon: "moon-outline",    difficulty: "medium" },
];

// Map template metric names to challenge categories where they differ
function templateMetricToCategory(metric: string): string {
  const map: Record<string, string> = {
    steps:       "steps",
    water:       "steps",    // no dedicated water category; falls back to steps tracking
    mindfulness: "exercise",
    spending:    "steps",    // no spending category; creator can adjust
    sleep:       "exercise",
  };
  return map[metric] ?? "steps";
}

export default async function challengesRoutes(app: FastifyInstance) {

  // GET /templates — list pre-built challenge templates
  app.get("/templates", async (_req) => {
    return CHALLENGE_TEMPLATES;
  });

  // POST /from-template — create a real challenge from a template
  app.post("/from-template", async (req, reply) => {
    const me = req.user_id;
    const { template_id, invited_friend_ids = [] } = req.body as any;

    const template = CHALLENGE_TEMPLATES.find(t => t.id === template_id);
    if (!template) {
      return reply.status(400).send({ error: `Unknown template_id: ${template_id}` });
    }
    if (!Array.isArray(invited_friend_ids)) {
      return reply.status(400).send({ error: "invited_friend_ids must be an array" });
    }

    // Compute start/end dates (start today, end after duration_days - 1)
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + template.duration_days - 1);
    const start_date = startDate.toISOString().slice(0, 10);
    const end_date = endDate.toISOString().slice(0, 10);

    const category = templateMetricToCategory(template.metric);
    const goal_description = template.description;
    const goal_value = template.goal;

    // Verify friend IDs are accepted friends
    if (invited_friend_ids.length > 0) {
      const friendCheck = await query<any>(
        `SELECT
           CASE WHEN user_id_a = $1 THEN user_id_b ELSE user_id_a END AS friend_id
         FROM friend_connections
         WHERE (user_id_a = $1 OR user_id_b = $1)
           AND status = 'accepted'`,
        [me]
      );
      const acceptedFriendSet = new Set(friendCheck.map((r: any) => r.friend_id));
      for (const fid of invited_friend_ids) {
        if (!acceptedFriendSet.has(fid)) {
          return reply.status(400).send({ error: `User ${fid} is not an accepted friend` });
        }
      }
    }

    const client = await pool.connect();
    let challenge: any;
    try {
      await client.query("BEGIN");

      const chalRes = await client.query(
        `INSERT INTO challenges (created_by, title, category, goal_description, goal_value, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, title, category, goal_description, goal_value, start_date, end_date, status, created_at`,
        [me, template.title, category, goal_description, goal_value, start_date, end_date]
      );
      challenge = chalRes.rows[0];

      // Add creator as participant
      await client.query(
        `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [challenge.id, me]
      );

      // Add invited friends as participants
      for (const fid of invited_friend_ids) {
        await client.query(
          `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [challenge.id, fid]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return reply.status(201).send({ ...challenge, template_id, template_metric: template.metric });
  });

  // GET / — list challenges I'm a participant in or created
  app.get("/", async (req) => {
    const me = req.user_id;

    const challenges = await query<any>(
      `SELECT DISTINCT ON (c.id)
         c.id, c.title, c.category, c.goal_description, c.goal_value,
         c.start_date, c.end_date, c.status,
         (c.created_by = $1) AS created_by_me,
         COALESCE(pc.participant_count, 0)::int AS participant_count
       FROM challenges c
       LEFT JOIN challenge_participants cp ON cp.challenge_id = c.id AND cp.user_id = $1
       LEFT JOIN (
         SELECT challenge_id, COUNT(*) AS participant_count
         FROM challenge_participants
         GROUP BY challenge_id
       ) pc ON pc.challenge_id = c.id
       WHERE c.created_by = $1 OR cp.user_id = $1
       ORDER BY c.id, c.created_at DESC`,
      [me]
    );

    // Attach my_progress for each challenge using a single batch query per unique
    // category+date-range group, avoiding N per-challenge round trips.
    // Group challenges by category+start+end so we can batch them together.
    type ChalGroup = { category: string; start: string; end: string; ids: string[] };
    const groups = new Map<string, ChalGroup>();
    for (const c of challenges) {
      const startStr = c.start_date instanceof Date ? c.start_date.toISOString().slice(0, 10) : String(c.start_date).slice(0, 10);
      const endStr   = c.end_date   instanceof Date ? c.end_date.toISOString().slice(0, 10)   : String(c.end_date).slice(0, 10);
      const key = `${c.category}|${startStr}|${endStr}`;
      if (!groups.has(key)) groups.set(key, { category: c.category, start: startStr, end: endStr, ids: [] });
      groups.get(key)!.ids.push(c.id);
    }

    // For each group, run one batch query (all challenges share same me user_id here)
    const progressMap = new Map<string, number>();
    for (const g of groups.values()) {
      const entries = g.ids.map(id => ({ userId: me, challengeId: id }));
      const batchResult = await computeProgressBatch(entries, g.category, g.start, g.end);
      for (const [k, v] of batchResult) progressMap.set(k, v);
    }

    const result = challenges.map((c: any) => {
      const startStr = c.start_date instanceof Date ? c.start_date.toISOString().slice(0, 10) : String(c.start_date).slice(0, 10);
      const endStr   = c.end_date   instanceof Date ? c.end_date.toISOString().slice(0, 10)   : String(c.end_date).slice(0, 10);
      const my_progress = progressMap.get(`${c.id}:${me}`) ?? 0;
      return { ...c, start_date: startStr, end_date: endStr, my_progress };
    });

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

    // Create challenge + participants atomically — a failure partway through
    // must not leave a challenge without its participants.
    const client = await pool.connect();
    let challenge: any;
    try {
      await client.query("BEGIN");

      const chalRes = await client.query(
        `INSERT INTO challenges (created_by, title, category, goal_description, goal_value, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, title, category, goal_description, goal_value, start_date, end_date, status, created_at`,
        [me, title, category, goal_description, goal_value ?? null, start_date, end_date]
      );
      challenge = chalRes.rows[0];

      // Add creator as participant
      await client.query(
        `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [challenge.id, me]
      );

      // Add friend participants
      for (const fid of friend_ids) {
        await client.query(
          `INSERT INTO challenge_participants (challenge_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [challenge.id, fid]
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return reply.status(201).send(challenge);
  });

  // GET /:id — challenge detail + participants with progress
  app.get("/:id", async (req, reply) => {
    const me = req.user_id;
    const { id } = req.params as any;

    // Must be participant or creator
    const chalRows = await query<any>(
      `SELECT c.id, c.title, c.category, c.goal_description, c.goal_value,
              c.start_date, c.end_date, c.status, c.created_by, c.created_at
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

    // Compute progress for all participants in one batch query
    const batchEntries = participants.map((p: any) => ({ userId: p.user_id, challengeId: challenge.id }));
    const batchProgress = await computeProgressBatch(batchEntries, challenge.category, startStr, endStr);

    // Only expose the minimal identity field the app renders (display_name).
    // Raw email/username fields are intentionally not returned to participants.
    const participantsWithProgress = participants.map((p: any) => ({
      user_id: p.user_id,
      display_name: p.username ?? p.email,
      joined_at: p.joined_at,
      progress: batchProgress.get(`${challenge.id}:${p.user_id}`) ?? 0,
      is_me: p.user_id === me,
    }));

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
      `SELECT id, status, created_by FROM challenges WHERE id = $1`,
      [id]
    );
    if (!chalRows[0]) {
      return reply.status(404).send({ error: "Challenge not found" });
    }
    if (chalRows[0].status !== "active") {
      return reply.status(400).send({ error: "Challenge is not active" });
    }

    // Gate: joining requires an accepted friendship with the creator or an
    // existing participant. Without this, anyone could join any challenge and
    // then read participants' identities and progress via GET /:id.
    const memberRows = await query<any>(
      `SELECT user_id FROM challenge_participants WHERE challenge_id = $1`,
      [id]
    );
    const memberIds: string[] = [
      chalRows[0].created_by,
      ...memberRows.map((r: any) => r.user_id),
    ];
    const friendRows = await query<any>(
      `SELECT 1 FROM friend_connections
       WHERE status = 'accepted'
         AND (
           (user_id_a = $1 AND user_id_b = ANY($2::uuid[]))
           OR (user_id_b = $1 AND user_id_a = ANY($2::uuid[]))
         )
       LIMIT 1`,
      [me, memberIds]
    );
    if (!friendRows[0]) {
      return reply.status(403).send({ error: "You must be friends with the challenge creator or a participant to join" });
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
