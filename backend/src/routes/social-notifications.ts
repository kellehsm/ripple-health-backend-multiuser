import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function socialNotificationsRoutes(app: FastifyInstance) {

  // GET / — get notification prefs (upsert defaults if none exist)
  app.get("/", async (req) => {
    const me = req.user_id;

    await query(
      `INSERT INTO social_notification_prefs (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [me]
    );

    const rows = await query<any>(
      `SELECT
         notify_friend_requests,
         notify_challenge_invites,
         notify_challenge_updates,
         notify_friend_book_finish,
         notify_friend_milestone
       FROM social_notification_prefs
       WHERE user_id = $1`,
      [me]
    );
    return rows[0];
  });

  // PATCH / — update notification prefs
  app.patch("/", async (req) => {
    const me = req.user_id;
    const {
      notify_friend_requests,
      notify_challenge_invites,
      notify_challenge_updates,
      notify_friend_book_finish,
      notify_friend_milestone,
    } = req.body as any;

    // Ensure row exists
    await query(
      `INSERT INTO social_notification_prefs (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [me]
    );

    const rows = await query<any>(
      `UPDATE social_notification_prefs SET
         notify_friend_requests    = COALESCE($2, notify_friend_requests),
         notify_challenge_invites  = COALESCE($3, notify_challenge_invites),
         notify_challenge_updates  = COALESCE($4, notify_challenge_updates),
         notify_friend_book_finish = COALESCE($5, notify_friend_book_finish),
         notify_friend_milestone   = COALESCE($6, notify_friend_milestone)
       WHERE user_id = $1
       RETURNING
         notify_friend_requests,
         notify_challenge_invites,
         notify_challenge_updates,
         notify_friend_book_finish,
         notify_friend_milestone`,
      [
        me,
        notify_friend_requests    ?? null,
        notify_challenge_invites  ?? null,
        notify_challenge_updates  ?? null,
        notify_friend_book_finish ?? null,
        notify_friend_milestone   ?? null,
      ]
    );
    return rows[0];
  });
}
