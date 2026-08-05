import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { syncUserHardcover } from "../jobs/hardcover-sync.js";

export default async function hardcoverRoutes(app: FastifyInstance) {
  // GET /api/hardcover/status — returns connection status (never returns the token)
  app.get("/status", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>(
      `SELECT settings->'hardcover' AS hc FROM user_settings WHERE user_id = $1`,
      [user_id]
    );
    const hc = rows[0]?.hc ?? {};
    return {
      connected:      !!hc.api_token,
      last_synced_at: hc.last_synced_at ?? null,
    };
  });

  // POST /api/hardcover/connect — verify token, then persist it
  app.post("/connect", async (req, reply) => {
    const user_id = req.user_id;
    const { api_token } = req.body as any;
    if (!api_token?.trim()) {
      return reply.status(400).send({ error: "api_token is required" });
    }

    // Verify the token by fetching the authenticated user's profile
    let verifyData: any;
    try {
      const res = await fetch("https://api.hardcover.app/v1/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${api_token.trim()}`,
        },
        body: JSON.stringify({ query: `query { me { id username } }` }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        return reply.status(400).send({ error: "Could not reach Hardcover — check your token and try again" });
      }
      verifyData = await res.json();
    } catch {
      return reply.status(400).send({ error: "Could not reach Hardcover — check your connection and try again" });
    }

    // me returns an array in Hardcover's Hasura schema
    const me = verifyData.data?.me?.[0];
    if (verifyData.errors?.length || !me?.id) {
      return reply.status(400).send({ error: "Invalid Hardcover token — make sure you copied it correctly from your Hardcover account settings" });
    }

    // Store token — merged into the existing hardcover sub-object so other keys survive
    await query(
      `INSERT INTO user_settings (user_id, settings)
       VALUES ($1, jsonb_build_object('hardcover', jsonb_build_object('api_token', $2::text)))
       ON CONFLICT (user_id) DO UPDATE
         SET settings = user_settings.settings ||
           jsonb_build_object('hardcover',
             COALESCE(user_settings.settings->'hardcover', '{}'::jsonb) ||
             jsonb_build_object('api_token', $2::text))`,
      [user_id, api_token.trim()]
    );

    return { ok: true, username: me.username };
  });

  // DELETE /api/hardcover/disconnect — remove token and all sync state
  app.delete("/disconnect", async (req) => {
    const user_id = req.user_id;
    // Remove the 'hardcover' key entirely from settings
    await query(
      `UPDATE user_settings SET settings = settings - 'hardcover' WHERE user_id = $1`,
      [user_id]
    );
    return { ok: true };
  });

  // POST /api/hardcover/sync — trigger a full sync for this user's connected books
  app.post("/sync", async (req, reply) => {
    const user_id = req.user_id;
    const rows = await query<any>(
      `SELECT settings->'hardcover'->>'api_token' AS api_token FROM user_settings WHERE user_id = $1`,
      [user_id]
    );
    const token = rows[0]?.api_token;
    if (!token) {
      return reply.status(400).send({ error: "Hardcover not connected" });
    }

    try {
      const result = await syncUserHardcover(user_id, token, app.log);
      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: err?.message ?? "Sync failed" });
    }
  });
}
