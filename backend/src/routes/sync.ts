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
      sync_id     TEXT        PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  app.post<{ Body: { items: BatchItem[] } }>("/batch", async (req) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) return [];

    const results: ItemResult[] = [];
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const item of items) {
        // Idempotency: skip if we already processed this sync_id successfully
        const { rows: logged } = await client.query(
          "SELECT 1 FROM sync_log WHERE sync_id = $1",
          [item.sync_id]
        );
        if (logged.length > 0) {
          results.push({ sync_id: item.sync_id, status: "already_processed" });
          continue;
        }

        try {
          await processItem(client, item, req.user_id);
          await client.query(
            "INSERT INTO sync_log (sync_id) VALUES ($1) ON CONFLICT DO NOTHING",
            [item.sync_id]
          );
          results.push({ sync_id: item.sync_id, status: "success" });
        } catch (err: any) {
          // PostgreSQL error codes:
          //   23502 = not_null_violation (missing required field)
          //   22P02 = invalid_text_representation (bad type cast)
          //   23514 = check_violation
          const isBadPayload =
            err?.code === "23502" ||
            err?.code === "22P02" ||
            err?.code === "23514" ||
            err?.message?.startsWith("Unknown endpoint");
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
