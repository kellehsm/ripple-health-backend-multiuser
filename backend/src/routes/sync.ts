import { FastifyInstance } from "fastify";
import { pool } from "../db.js";

type BatchItem = {
  sync_id: string;
  endpoint: string;
  method: string;
  payload: Record<string, any>;
};

type ItemResult = {
  sync_id: string;
  status: "success" | "already_processed" | "discard" | "error";
  error?: string;
};

export default async function syncRoutes(app: FastifyInstance) {
  // sync_log is also created in the migration script; this is a safety net for
  // environments where the migration hasn't been run yet.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sync_log (
      sync_id     TEXT        NOT NULL,
      user_id     UUID,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Idempotency must be scoped per user: a global sync_id key lets one user's
  // (or attacker's) sync_id collide with another user's and silently drop writes.
  // Mirrors migration 036_sync_log_user_scope.sql for environments that haven't
  // run it. Checked first because the app's DB user doesn't own the table —
  // a blind ALTER fails on ownership even when it would be a no-op.
  const { rows: userIdCol } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'sync_log' AND column_name = 'user_id'`
  );
  if (userIdCol.length === 0) {
    await pool.query(`ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS user_id UUID`);
    await pool.query(`ALTER TABLE sync_log DROP CONSTRAINT IF EXISTS sync_log_pkey`);
  }
  const { rows: idx } = await pool.query(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'sync_log_user_sync_idx'`
  );
  if (idx.length === 0) {
    await pool.query(
      `CREATE UNIQUE INDEX sync_log_user_sync_idx ON sync_log (user_id, sync_id)`
    );
  }

  app.post<{ Body: { items: BatchItem[] } }>("/batch", async (req, reply) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return [];
    if (items.length > 500) {
      reply.code(400);
      return { error: "Too many items (max 500)" };
    }

    const results: ItemResult[] = [];
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const item of items) {
        // Idempotency: skip if we already processed this sync_id for THIS user
        const { rows: logged } = await client.query(
          "SELECT 1 FROM sync_log WHERE sync_id = $1 AND user_id = $2",
          [item.sync_id, req.user_id]
        );
        if (logged.length > 0) {
          results.push({ sync_id: item.sync_id, status: "already_processed" });
          continue;
        }

        // Savepoint per item: a failed item aborts the enclosing transaction
        // (25P02) unless rolled back to a savepoint, which would make COMMIT a
        // silent rollback while `results` still claims earlier items succeeded.
        await client.query("SAVEPOINT sync_item");
        try {
          await processItem(client, item, req.user_id);
          await client.query(
            "INSERT INTO sync_log (sync_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [item.sync_id, req.user_id]
          );
          await client.query("RELEASE SAVEPOINT sync_item");
          results.push({ sync_id: item.sync_id, status: "success" });
        } catch (err: any) {
          await client.query("ROLLBACK TO SAVEPOINT sync_item");
          // PostgreSQL error codes:
          //   23502 = not_null_violation (missing required field)
          //   22P02 = invalid_text_representation (bad type cast)
          //   23514 = check_violation
          const isBadPayload =
            err?.code === "23502" ||
            err?.code === "22P02" ||
            err?.code === "23514" ||
            err?.message?.startsWith("Unknown endpoint") ||
            err?.message?.startsWith("Metric not found");
          results.push({
            sync_id: item.sync_id,
            status: isBadPayload ? "discard" : "error",
            error: err?.message,
          });
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    return results;
  });
}

async function processItem(client: any, item: BatchItem, user_id: string): Promise<void> {
  const { endpoint, payload: p } = item;

  if (endpoint === "/meals") {
    await client.query(
      `INSERT INTO meals
         (user_id, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id, context, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,COALESCE($10::timestamptz, now()))`,
      [
        user_id, p.name, p.meal_type ?? null,
        p.carbs_g ?? null, p.sugar_g ?? null, p.calories ?? null,
        p.source_db ?? null, p.source_food_id ?? null,
        p.context ? JSON.stringify(p.context) : null,
        p.logged_at ?? null,
      ]
    );
    return;
  }

  if (endpoint === "/journal") {
    const type = p.entry_type ?? "period";
    if (type === "period" && p.period) {
      const { rows: existing } = await client.query(
        `SELECT id FROM journal_entries WHERE user_id = $1 AND period = $2 AND logged_at::date = CURRENT_DATE`,
        [user_id, p.period]
      );
      if (existing.length > 0) {
        await client.query(
          `UPDATE journal_entries
           SET mood_score=$1, mood_label=$2, entry_text=$3,
               context=COALESCE($4::jsonb, context)
           WHERE id=$5`,
          [
            p.mood_score, p.mood_label ?? null, p.entry_text ?? null,
            p.context ? JSON.stringify(p.context) : null,
            existing[0].id,
          ]
        );
        return;
      }
    }
    await client.query(
      `INSERT INTO journal_entries
         (user_id, mood_score, mood_label, entry_text, period, entry_type, context, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,COALESCE($8::timestamptz, now()))`,
      [
        user_id, p.mood_score, p.mood_label ?? null, p.entry_text ?? null,
        p.period ?? null, type,
        p.context ? JSON.stringify(p.context) : null,
        p.logged_at ?? null,
      ]
    );
    return;
  }

  if (endpoint === "/spending") {
    await client.query(
      `INSERT INTO spending_entries (user_id, amount, category, source, logged_at)
       VALUES ($1,$2,$3,COALESCE($4,'manual'),COALESCE($5::timestamptz, now()))`,
      [user_id, p.amount, p.category ?? null, p.source ?? null, p.logged_at ?? null]
    );
    return;
  }

  // /metrics/:metricId/logs
  if (/^\/metrics\/[^/]+\/logs$/.test(endpoint)) {
    const metricId = endpoint.split("/")[2];
    // Ownership check: metricId is client-supplied — without this, a user could
    // write metric_logs rows onto another user's metric.
    const { rows: owned } = await client.query(
      "SELECT 1 FROM metrics WHERE id = $1 AND user_id = $2",
      [metricId, user_id]
    );
    if (owned.length === 0) {
      throw new Error(`Metric not found or not owned by user: ${metricId}`);
    }
    await client.query(
      `INSERT INTO metric_logs (metric_id, value, note, logged_at)
       VALUES ($1,$2,$3,COALESCE($4::timestamptz, now()))`,
      [metricId, p.value, p.note ?? null, p.logged_at ?? null]
    );
    return;
  }

  if (endpoint === "/substances") {
    await client.query(
      `INSERT INTO substance_logs
         (user_id, substance_type, name, caffeine_mg, abv_percent, volume_ml, source_db, logged_at)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'manual'),COALESCE($8::timestamptz, now()))`,
      [
        user_id, p.substance_type, p.name,
        p.caffeine_mg ?? null, p.abv_percent ?? null, p.volume_ml ?? null,
        p.source_db ?? null, p.logged_at ?? null,
      ]
    );
    return;
  }

  throw new Error(`Unknown endpoint for batch sync: ${endpoint}`);
}
