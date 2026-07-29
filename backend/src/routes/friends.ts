import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { estToday, estYesterday } from "../lib/estDate.js";

// Canonical ordering: smaller UUID is always user_id_a
function friendPair(a: string, b: string): { user_id_a: string; user_id_b: string } {
  return a < b ? { user_id_a: a, user_id_b: b } : { user_id_a: b, user_id_b: a };
}

// Allowed categories for leaderboard / sharing (privacy boundary enforced here)
const ALLOWED_CATEGORIES = new Set(["steps", "exercise", "hobbies", "books"]);

export default async function friendsRoutes(app: FastifyInstance) {

  // GET / — list accepted friends with their sharing prefs
  app.get("/", async (req) => {
    const me = req.user_id;
    const rows = await query<any>(
      `SELECT
         fc.id AS connection_id,
         CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END AS user_id,
         u.email,
         u.username,
         fc.created_at AS connected_at,
         COALESCE(sp.share_steps,    false) AS share_steps,
         COALESCE(sp.share_exercise, false) AS share_exercise,
         COALESCE(sp.share_hobbies,  false) AS share_hobbies,
         COALESCE(sp.share_books,    false) AS share_books
       FROM friend_connections fc
       JOIN users u ON u.id = CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END
       LEFT JOIN friend_sharing_prefs sp ON sp.user_id = u.id
       WHERE (fc.user_id_a = $1 OR fc.user_id_b = $1)
         AND fc.status = 'accepted'
       ORDER BY u.email`,
      [me]
    );
    return rows.map((r: any) => ({
      connection_id: r.connection_id,
      user_id: r.user_id,
      email: r.email,
      username: r.username,
      connected_at: r.connected_at,
      sharing: {
        steps: r.share_steps,
        exercise: r.share_exercise,
        hobbies: r.share_hobbies,
        books: r.share_books,
      },
    }));
  });

  // GET /requests — pending requests sent TO me
  app.get("/requests", async (req) => {
    const me = req.user_id;
    const rows = await query<any>(
      `SELECT
         fc.id AS connection_id,
         u.id AS from_user_id,
         u.email AS from_email,
         u.username AS from_username,
         fc.created_at AS sent_at
       FROM friend_connections fc
       JOIN users u ON u.id = fc.requested_by
       WHERE (fc.user_id_a = $1 OR fc.user_id_b = $1)
         AND fc.status = 'pending'
         AND fc.requested_by != $1
       ORDER BY fc.created_at DESC`,
      [me]
    );
    return rows;
  });

  // GET /sent — pending requests sent BY me
  app.get("/sent", async (req) => {
    const me = req.user_id;
    const rows = await query<any>(
      `SELECT
         fc.id AS connection_id,
         CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END AS to_user_id,
         u.email AS to_email,
         u.username AS to_username,
         fc.created_at AS sent_at
       FROM friend_connections fc
       JOIN users u ON u.id = CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END
       WHERE (fc.user_id_a = $1 OR fc.user_id_b = $1)
         AND fc.status = 'pending'
         AND fc.requested_by = $1
       ORDER BY fc.created_at DESC`,
      [me]
    );
    return rows;
  });

  // POST /request — send a friend request by email or username
  app.post("/request", async (req, reply) => {
    const me = req.user_id;
    const { identifier } = req.body as any;
    if (!identifier || typeof identifier !== "string") {
      return reply.status(400).send({ error: "identifier is required" });
    }

    // Look up target user by email or username
    const targetRows = await query<any>(
      `SELECT id FROM users WHERE email = $1 OR username = $1 LIMIT 1`,
      [identifier.trim().toLowerCase()]
    );
    if (!targetRows[0]) {
      return reply.status(404).send({ error: "User not found" });
    }
    const target_id: string = targetRows[0].id;

    if (target_id === me) {
      return reply.status(400).send({ error: "You cannot send a friend request to yourself" });
    }

    const { user_id_a, user_id_b } = friendPair(me, target_id);

    // Check for existing connection
    const existing = await query<any>(
      `SELECT id, status FROM friend_connections WHERE user_id_a = $1 AND user_id_b = $2`,
      [user_id_a, user_id_b]
    );
    if (existing[0]) {
      if (existing[0].status === "accepted") {
        return reply.status(409).send({ error: "Already friends" });
      }
      return reply.status(409).send({ error: "Friend request already exists" });
    }

    const rows = await query<any>(
      `INSERT INTO friend_connections (user_id_a, user_id_b, status, requested_by)
       VALUES ($1, $2, 'pending', $3) RETURNING id, created_at`,
      [user_id_a, user_id_b, me]
    );
    return reply.status(201).send({ connection_id: rows[0].id, sent_at: rows[0].created_at });
  });

  // POST /:connection_id/accept — accept a pending request sent TO me
  app.post("/:connection_id/accept", async (req, reply) => {
    const me = req.user_id;
    const { connection_id } = req.params as any;

    const rows = await query<any>(
      `SELECT id, requested_by FROM friend_connections
       WHERE id = $1
         AND (user_id_a = $2 OR user_id_b = $2)
         AND status = 'pending'`,
      [connection_id, me]
    );
    if (!rows[0]) {
      return reply.status(404).send({ error: "Pending request not found" });
    }
    if (rows[0].requested_by === me) {
      return reply.status(400).send({ error: "Cannot accept a request you sent" });
    }

    await query(
      `UPDATE friend_connections SET status = 'accepted' WHERE id = $1`,
      [connection_id]
    );
    return { ok: true };
  });

  // POST /:connection_id/decline — decline, cancel, or unfriend
  app.post("/:connection_id/decline", async (req, reply) => {
    const me = req.user_id;
    const { connection_id } = req.params as any;

    const rows = await query<any>(
      `DELETE FROM friend_connections
       WHERE id = $1 AND (user_id_a = $2 OR user_id_b = $2)
       RETURNING id`,
      [connection_id, me]
    );
    if (!rows[0]) {
      return reply.status(404).send({ error: "Connection not found" });
    }
    return { ok: true };
  });

  // GET /sharing-prefs — get my sharing prefs
  app.get("/sharing-prefs", async (req) => {
    const me = req.user_id;
    const rows = await query<any>(
      `SELECT share_steps, share_exercise, share_hobbies, share_books
       FROM friend_sharing_prefs WHERE user_id = $1`,
      [me]
    );
    return rows[0];
  });

  // PATCH /sharing-prefs — update sharing prefs
  app.patch("/sharing-prefs", async (req, reply) => {
    const me = req.user_id;
    const { share_steps, share_exercise, share_hobbies, share_books } = req.body as any;

    const rows = await query<any>(
      `UPDATE friend_sharing_prefs SET
         share_steps    = COALESCE($2, share_steps),
         share_exercise = COALESCE($3, share_exercise),
         share_hobbies  = COALESCE($4, share_hobbies),
         share_books    = COALESCE($5, share_books)
       WHERE user_id = $1
       RETURNING share_steps, share_exercise, share_hobbies, share_books`,
      [me, share_steps ?? null, share_exercise ?? null, share_hobbies ?? null, share_books ?? null]
    );
    return rows[0];
  });

  // GET /leaderboard/:category — weekly leaderboard among me + accepted friends who share
  app.get("/leaderboard/:category", async (req, reply) => {
    const me = req.user_id;
    const { category } = req.params as any;

    if (!ALLOWED_CATEGORIES.has(category)) {
      return reply.status(400).send({ error: "category must be one of: steps, exercise, hobbies, books" });
    }

    // Build list of eligible user IDs: me + accepted friends who share this category
    // We always include ourselves regardless of sharing prefs
    const friendsRows = await query<any>(
      `SELECT
         CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END AS friend_id,
         sp.share_steps,
         sp.share_exercise,
         sp.share_hobbies,
         sp.share_books
       FROM friend_connections fc
       LEFT JOIN friend_sharing_prefs sp
         ON sp.user_id = CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END
       WHERE (fc.user_id_a = $1 OR fc.user_id_b = $1)
         AND fc.status = 'accepted'`,
      [me]
    );

    const shareCol: Record<string, string> = {
      steps: "share_steps",
      exercise: "share_exercise",
      hobbies: "share_hobbies",
      books: "share_books",
    };

    const eligibleIds: string[] = [me];
    for (const row of friendsRows) {
      if (row[shareCol[category]]) {
        eligibleIds.push(row.friend_id);
      }
    }

    // Compute value per user based on category
    // Steps = sum of metric_logs WHERE metric name='steps' this week
    // Exercise = count of exercise_sessions this week
    // Hobbies = sum of hobby_logs amount this week
    // Books = count of books with status='finished' this month
    let valueRows: Array<{ user_id: string; value: number }> = [];

    if (category === "steps") {
      valueRows = await query<any>(
        `SELECT m.user_id, COALESCE(SUM(ml.value), 0)::numeric AS value
         FROM metrics m
         JOIN metric_logs ml ON ml.metric_id = m.id
         WHERE m.name = 'steps'
           AND m.user_id = ANY($1::uuid[])
           AND ml.logged_at >= date_trunc('week', now())
           AND ml.logged_at < date_trunc('week', now()) + interval '7 days'
         GROUP BY m.user_id`,
        [eligibleIds]
      );
    } else if (category === "exercise") {
      valueRows = await query<any>(
        `SELECT user_id, COUNT(*)::numeric AS value
         FROM exercise_sessions
         WHERE user_id = ANY($1::uuid[])
           AND started_at >= date_trunc('week', now())
           AND started_at < date_trunc('week', now()) + interval '7 days'
         GROUP BY user_id`,
        [eligibleIds]
      );
    } else if (category === "hobbies") {
      valueRows = await query<any>(
        `SELECT hl.user_id, COALESCE(SUM(hl.amount), 0)::numeric AS value
         FROM hobby_logs hl
         WHERE hl.user_id = ANY($1::uuid[])
           AND hl.logged_at >= date_trunc('week', now())
           AND hl.logged_at < date_trunc('week', now()) + interval '7 days'
         GROUP BY hl.user_id`,
        [eligibleIds]
      );
    } else if (category === "books") {
      valueRows = await query<any>(
        `SELECT user_id, COUNT(*)::numeric AS value
         FROM books
         WHERE user_id = ANY($1::uuid[])
           AND status = 'finished'
           AND finished_at >= date_trunc('month', now())
           AND finished_at < date_trunc('month', now()) + interval '1 month'
         GROUP BY user_id`,
        [eligibleIds]
      );
    }

    // Build value map, default to 0 for users with no data
    const valueMap = new Map<string, number>();
    for (const uid of eligibleIds) valueMap.set(uid, 0);
    for (const row of valueRows) valueMap.set(row.user_id, Number(row.value));

    // Get display names (email) for all eligible users
    const userRows = await query<any>(
      `SELECT id, email, username FROM users WHERE id = ANY($1::uuid[])`,
      [eligibleIds]
    );
    const userMap = new Map<string, { email: string; username: string | null }>();
    for (const u of userRows) userMap.set(u.id, { email: u.email, username: u.username });

    // Sort by value desc, assign rank
    const sorted = eligibleIds
      .map((uid) => ({
        user_id: uid,
        display_name: userMap.get(uid)?.username ?? userMap.get(uid)?.email ?? uid,
        value: valueMap.get(uid) ?? 0,
        is_me: uid === me,
      }))
      .sort((a, b) => b.value - a.value);

    // Assign rank (ties share same rank)
    let rank = 1;
    const result = sorted.map((entry, idx) => {
      if (idx > 0 && entry.value < sorted[idx - 1].value) {
        rank = idx + 1;
      }
      return { ...entry, rank };
    });

    return result;
  });

  // GET /activity-feed — friends' recent streak milestones for shared categories
  app.get("/activity-feed", async (req) => {
    const me = req.user_id;

    // Friends who share at least one category
    const friendRows = await query<any>(
      `SELECT
         CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END AS friend_id,
         u.username, u.email,
         COALESCE(sp.share_steps,    false) AS share_steps,
         COALESCE(sp.share_exercise, false) AS share_exercise,
         COALESCE(sp.share_books,    false) AS share_books
       FROM friend_connections fc
       JOIN users u ON u.id = CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END
       LEFT JOIN friend_sharing_prefs sp ON sp.user_id = u.id
       WHERE (fc.user_id_a = $1 OR fc.user_id_b = $1) AND fc.status = 'accepted'`,
      [me]
    );

    const eligible = friendRows.filter(
      (r: any) => r.share_steps || r.share_exercise || r.share_books
    );
    if (eligible.length === 0) return [];

    const friendIds = eligible.map((r: any) => r.friend_id);

    function calcStreak(days: string[]): number {
      if (days.length === 0) return 0;
      const today = estToday();
      const yesterday = estYesterday();
      if (days[0] !== today && days[0] !== yesterday) return 0;
      let streak = 0;
      let expected = days[0];
      for (const day of days) {
        if (day === expected) {
          streak++;
          const d = new Date(expected + "T12:00:00");
          d.setDate(d.getDate() - 1);
          expected = d.toISOString().slice(0, 10);
        } else break;
      }
      return streak;
    }

    const [stepsDays, exerciseDays, readingDays] = await Promise.all([
      query<any>(
        `SELECT m.user_id, ml.logged_at::date AS day
         FROM metrics m JOIN metric_logs ml ON ml.metric_id = m.id
         WHERE m.name = 'steps' AND m.user_id = ANY($1::uuid[]) AND ml.value > 0
           AND ml.logged_at >= current_date - 30
         ORDER BY m.user_id, day DESC`,
        [friendIds]
      ),
      query<any>(
        `SELECT user_id, started_at::date AS day FROM exercise_sessions
         WHERE user_id = ANY($1::uuid[]) AND ended_at IS NOT NULL
           AND started_at >= current_date - 30
         ORDER BY user_id, day DESC`,
        [friendIds]
      ),
      query<any>(
        `SELECT user_id, logged_at::date AS day FROM reading_logs
         WHERE user_id = ANY($1::uuid[]) AND logged_at >= current_date - 30
         ORDER BY user_id, day DESC`,
        [friendIds]
      ),
    ]);

    function groupByUser(rows: any[]): Map<string, string[]> {
      const m = new Map<string, string[]>();
      for (const r of rows) {
        const uid = r.user_id;
        const day = r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day).slice(0, 10);
        if (!m.has(uid)) m.set(uid, []);
        const arr = m.get(uid)!;
        if (!arr.includes(day)) arr.push(day);
      }
      return m;
    }

    const stepsMap = groupByUser(stepsDays);
    const exerciseMap = groupByUser(exerciseDays);
    const readingMap = groupByUser(readingDays);

    const feed = [];
    for (const f of eligible) {
      const milestones: Array<{ type: string; label: string; count: number }> = [];
      if (f.share_steps) {
        const s = calcStreak(stepsMap.get(f.friend_id) ?? []);
        if (s >= 3) milestones.push({ type: "steps_streak", label: "step streak", count: s });
      }
      if (f.share_exercise) {
        const s = calcStreak(exerciseMap.get(f.friend_id) ?? []);
        if (s >= 3) milestones.push({ type: "exercise_streak", label: "workout streak", count: s });
      }
      if (f.share_books) {
        const s = calcStreak(readingMap.get(f.friend_id) ?? []);
        if (s >= 3) milestones.push({ type: "reading_streak", label: "reading streak", count: s });
      }
      if (milestones.length > 0) {
        feed.push({
          user_id: f.friend_id,
          display_name: f.username ?? f.email,
          milestones,
        });
      }
    }

    return feed;
  });

  // POST /nudge/:friendId — poke a friend (24h rate-limit)
  app.post("/nudge/:friendId", async (req, reply) => {
    const me = req.user_id;
    const { friendId } = req.params as any;

    const friendship = await query<any>(
      `SELECT id FROM friend_connections
       WHERE (user_id_a = $1 AND user_id_b = $2) OR (user_id_a = $2 AND user_id_b = $1)
         AND status = 'accepted'`,
      [me, friendId]
    );
    if (!friendship[0]) {
      return reply.status(403).send({ error: "Not friends" });
    }

    const recent = await query<any>(
      `SELECT id FROM friend_nudges
       WHERE sender_id = $1 AND recipient_id = $2 AND sent_at > NOW() - INTERVAL '24 hours'`,
      [me, friendId]
    );
    if (recent[0]) {
      return reply.status(429).send({ error: "Already nudged recently" });
    }

    await query(
      `INSERT INTO friend_nudges (sender_id, recipient_id) VALUES ($1, $2)`,
      [me, friendId]
    );
    return { ok: true };
  });

  // GET /nudges — nudges received in the last 7 days
  app.get("/nudges", async (req) => {
    const me = req.user_id;
    const rows = await query<any>(
      `SELECT fn.sender_id, u.username AS display_name, fn.sent_at
       FROM friend_nudges fn
       JOIN users u ON u.id = fn.sender_id
       WHERE fn.recipient_id = $1 AND fn.sent_at > NOW() - INTERVAL '7 days'
       ORDER BY fn.sent_at DESC`,
      [me]
    );
    return rows;
  });

  // GET /reactions — reactions for a category + week scoped to friend group
  app.get("/reactions", async (req, reply) => {
    const me = req.user_id;
    const { category, weekStart } = req.query as any;
    if (!ALLOWED_CATEGORIES.has(category)) {
      return reply.status(400).send({ error: "invalid category" });
    }
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return reply.status(400).send({ error: "weekStart must be YYYY-MM-DD" });
    }

    const friendIds = await query<any>(
      `SELECT CASE WHEN fc.user_id_a = $1 THEN fc.user_id_b ELSE fc.user_id_a END AS friend_id
       FROM friend_connections fc
       WHERE (fc.user_id_a = $1 OR fc.user_id_b = $1) AND fc.status = 'accepted'`,
      [me]
    );
    const eligibleIds = [me, ...friendIds.map((r: any) => r.friend_id)];

    const rows = await query<any>(
      `SELECT lr.from_user_id, lr.to_user_id, lr.emoji
       FROM leaderboard_reactions lr
       WHERE lr.category = $1 AND lr.week_start = $2
         AND lr.from_user_id = ANY($3::uuid[])
         AND lr.to_user_id = ANY($3::uuid[])`,
      [category, weekStart, eligibleIds]
    );
    return rows;
  });

  // POST /reactions — upsert a reaction (one per from→to per category per week)
  app.post("/reactions", async (req, reply) => {
    const me = req.user_id;
    const { to_user_id, category, emoji, week_start } = req.body as any;

    if (!ALLOWED_CATEGORIES.has(category)) {
      return reply.status(400).send({ error: "invalid category" });
    }
    if (to_user_id === me) {
      return reply.status(400).send({ error: "Cannot react to yourself" });
    }

    const friendship = await query<any>(
      `SELECT id FROM friend_connections
       WHERE ((user_id_a = $1 AND user_id_b = $2) OR (user_id_a = $2 AND user_id_b = $1))
         AND status = 'accepted'`,
      [me, to_user_id]
    );
    if (!friendship[0]) {
      return reply.status(403).send({ error: "Not friends" });
    }

    await query(
      `INSERT INTO leaderboard_reactions (from_user_id, to_user_id, category, emoji, week_start)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (from_user_id, to_user_id, category, week_start) DO UPDATE SET emoji = $4`,
      [me, to_user_id, category, emoji, week_start]
    );
    return { ok: true };
  });

  // PATCH /username — set my username
  app.patch("/username", async (req, reply) => {
    const me = req.user_id;
    const { username } = req.body as any;

    if (!username || typeof username !== "string") {
      return reply.status(400).send({ error: "username is required" });
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return reply.status(400).send({
        error: "Username must be 3-20 characters and contain only letters, numbers, and underscores",
      });
    }

    try {
      const rows = await query<any>(
        `UPDATE users SET username = $1 WHERE id = $2 RETURNING id, username`,
        [username, me]
      );
      return rows[0];
    } catch (err: any) {
      if (err?.code === "23505") {
        return reply.status(409).send({ error: "Username already taken" });
      }
      throw err;
    }
  });
}
