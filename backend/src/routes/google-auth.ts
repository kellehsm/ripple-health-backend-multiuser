import { FastifyInstance } from "fastify";
import { query } from "../db.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const APP_REDIRECT = "wellnessfresh://oauth";

export default async function googleAuthRoutes(app: FastifyInstance) {
  // Called by Google after user authorizes — exchanges code, stores refresh token, redirects back to app
  app.get("/callback", async (req, reply) => {
    const { code, error } = req.query as any;

    if (error || !code) {
      return reply.redirect(302, `${APP_REDIRECT}?status=error&reason=${encodeURIComponent(error ?? "no_code")}`);
    }

    try {
      const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      });
      const tokens: any = await tokenRes.json();

      if (!tokens.refresh_token) {
        app.log.error({ tokens }, "No refresh_token in Google response");
        return reply.redirect(302, `${APP_REDIRECT}?status=error&reason=no_refresh_token`);
      }

      const userId = process.env.DEFAULT_USER_ID!;
      const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [userId]);
      const existing = rows[0]?.settings ?? {};
      const merged = {
        ...existing,
        google_drive: {
          refresh_token: tokens.refresh_token,
          auto_backup: existing.google_drive?.auto_backup ?? true,
          connected_at: new Date().toISOString(),
          last_backup: existing.google_drive?.last_backup ?? null,
        },
      };
      await query(
        `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET settings = $2::jsonb`,
        [userId, JSON.stringify(merged)]
      );

      return reply.redirect(302, `${APP_REDIRECT}?status=connected`);
    } catch (err: any) {
      app.log.error({ err }, "Google OAuth callback failed");
      return reply.redirect(302, `${APP_REDIRECT}?status=error&reason=server_error`);
    }
  });
}
