import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function spendingRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const { since } = req.query as any;
    if (since) {
      return query(
        `SELECT * FROM spending_entries WHERE user_id = $1 AND logged_at >= $2 ORDER BY logged_at DESC`,
        [user_id, since]
      );
    }
    return query(`SELECT * FROM spending_entries WHERE user_id = $1 ORDER BY logged_at DESC LIMIT 100`, [user_id]);
  });

  app.post("/", async (req) => {
    const user_id = req.user_id;
    const { amount, category, merchant_name, notes, source, logged_at } = req.body as any;
    const rows = await query(
      `INSERT INTO spending_entries (user_id, amount, category, merchant_name, notes, source, logged_at)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'manual'), COALESCE($7, now())) RETURNING *`,
      [user_id, amount, category, merchant_name ?? null, notes ?? null, source, logged_at]
    );
    return rows[0];
  });

  app.patch("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    const { category, notes, tag } = req.body as any;
    const rows = await query(
      `UPDATE spending_entries SET category = $1, notes = $2, tag = $3
       WHERE id = $4 AND user_id = $5 RETURNING *`,
      [category ?? null, notes ?? null, tag ?? null, id, user_id]
    );
    if (!rows[0]) return { error: "Not found" };
    return rows[0];
  });

  app.get("/mood-suggest", async (req) => {
    const user_id = req.user_id;
    const windowStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Find qualifying spending entry (amount >= 25, untagged, in last 2 hours)
    const spendingRows = await query<{
      id: string;
      amount: number;
      merchant_name: string | null;
      logged_at: string;
    }>(
      `SELECT id, amount, merchant_name, logged_at
       FROM spending_entries
       WHERE user_id = $1
         AND logged_at >= $2
         AND amount >= 25
         AND tag IS NULL
       ORDER BY logged_at DESC
       LIMIT 1`,
      [user_id, windowStart]
    );

    if (!spendingRows[0]) return { suggestion: null };

    // Find qualifying mood entry in same 2-hour window
    const moodRows = await query<{ mood_label: string }>(
      `SELECT mood_label
       FROM journal_entries
       WHERE user_id = $1
         AND entry_type = 'mood'
         AND logged_at >= $2
         AND (mood_score <= 3 OR mood_label IN ('Sad', 'Anxious', 'Mad'))
       ORDER BY logged_at DESC
       LIMIT 1`,
      [user_id, windowStart]
    );

    if (!moodRows[0]) return { suggestion: null };

    const spending = spendingRows[0];
    const mood = moodRows[0];

    return {
      suggestion: {
        spending_id: spending.id,
        amount: spending.amount,
        merchant_name: spending.merchant_name,
        mood_label: mood.mood_label,
        logged_at: spending.logged_at,
      },
    };
  });

  app.delete("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    await query(`DELETE FROM spending_entries WHERE id = $1 AND user_id = $2`, [id, user_id]);
    return { ok: true };
  });
}
