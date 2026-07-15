import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const API_BASE = process.env.DEXCOM_API_BASE ?? "https://sandbox-api.dexcom.com";

export default async function dexcomAuthRoutes(app: FastifyInstance) {
  app.get("/login", { preHandler: [requireAuth] }, async (req, reply) => {
    const user_id = req.user_id;
    const params = new URLSearchParams({
      client_id: process.env.DEXCOM_CLIENT_ID!,
      redirect_uri: process.env.DEXCOM_REDIRECT_URI!,
      response_type: "code",
      state: user_id,
      scope: "offline_access",
    });
    reply.redirect(`${API_BASE}/v2/oauth2/login?${params.toString()}`);
  });

  app.get("/callback", async (req, reply) => {
    const { code, state } = req.query as any;
    const user_id = state;
    if (!code) return { error: "no code returned from Dexcom" };

    const body = new URLSearchParams({
      client_id: process.env.DEXCOM_CLIENT_ID!,
      client_secret: process.env.DEXCOM_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: process.env.DEXCOM_REDIRECT_URI!,
    });

    const res = await fetch(`${API_BASE}/v2/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!res.ok) return { error: `token exchange failed: ${res.status}` };
    const tokens = await res.json();

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
    await query(
      `INSERT INTO dexcom_tokens (user_id, access_token, refresh_token, expires_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         expires_at = EXCLUDED.expires_at`,
      [user_id, tokens.access_token, tokens.refresh_token, expiresAt]
    );

    return { ok: true, message: "Dexcom connected. You can close this window." };
  });
}

