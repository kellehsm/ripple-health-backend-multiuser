import { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { query } from "../db.js";

const APPLICATION_ID = "d8665ade-9673-4e27-9ff6-92db4ce13d13";

const DEXCOM_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "User-Agent": "Dexcom Share/3.0.2.11 CFNetwork/711.2.23 Darwin/14.0.0",
  Accept: "application/json",
  "Accept-Language": "en-us",
};

function buildBaseUrl(region?: string): string {
  return region === "ous"
    ? "https://shareous1.dexcom.com/ShareWebServices/Services"
    : "https://share2.dexcom.com/ShareWebServices/Services";
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

export default async function dexcomVerifyRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      username?: string;
      account_id?: string;
      password: string;
      region?: "us" | "ous";
    };
  }>(
    "/verify-share",
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const { username, account_id, password, region } = req.body;

      if (!password) {
        return reply.status(400).send({ error: "password is required" });
      }
      if (!username && !account_id) {
        return reply.status(400).send({ error: "username or account_id is required" });
      }

      const baseUrl = buildBaseUrl(region);

      if (username) {
        // Try LoginPublisherAccountByName
        let res: Response;
        let text: string;
        try {
          res = await fetch(`${baseUrl}/General/LoginPublisherAccountByName`, {
            method: "POST",
            headers: DEXCOM_HEADERS,
            body: JSON.stringify({ accountName: username, password, applicationId: APPLICATION_ID }),
          });
          text = await res.text();
        } catch (err: any) {
          return reply.status(502).send({ error: "Could not reach Dexcom Share API." });
        }

        if (!res.ok || !text.trim()) {
          // Determine failure type
          if (/password/i.test(text)) {
            return reply.status(401).send({
              error: "Incorrect username or password. Double-check your Dexcom Share credentials.",
            });
          }
          // SSO, account not found, or other — suggest account_id flow
          return reply.status(200).send({
            ok: false,
            needs_account_id: true,
            message:
              "Standard login didn't work for this account — enter your Account ID instead.",
          });
        }

        let sessionId: string;
        try {
          sessionId = JSON.parse(text) as string;
        } catch {
          return reply.status(200).send({
            ok: false,
            needs_account_id: true,
            message:
              "Standard login didn't work for this account — enter your Account ID instead.",
          });
        }

        if (!sessionId || sessionId === ZERO_UUID) {
          return reply.status(200).send({
            ok: false,
            needs_account_id: true,
            message:
              "Standard login didn't work for this account — enter your Account ID instead.",
          });
        }

        // Success — save credentials
        await query(
          `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
           ON CONFLICT (user_id) DO UPDATE SET settings = user_settings.settings || $2::jsonb`,
          [
            req.user_id,
            JSON.stringify({
              dexcom: {
                share_account_name: username,
                share_password: password,
                share_region: region ?? "us",
              },
            }),
          ]
        );
        return { ok: true, method: "name" };
      }

      // account_id path — LoginPublisherAccountById
      let res: Response;
      let text: string;
      try {
        res = await fetch(`${baseUrl}/General/LoginPublisherAccountById`, {
          method: "POST",
          headers: DEXCOM_HEADERS,
          body: JSON.stringify({ accountId: account_id, password, applicationId: APPLICATION_ID }),
        });
        text = await res.text();
      } catch (err: any) {
        return reply.status(502).send({ error: "Could not reach Dexcom Share API." });
      }

      if (!res.ok || !text.trim()) {
        if (/password/i.test(text)) {
          return reply.status(401).send({
            error: "Incorrect username or password. Double-check your Dexcom Share credentials.",
          });
        }
        return reply.status(401).send({
          error: "Incorrect username or password. Double-check your Dexcom Share credentials.",
        });
      }

      let sessionId: string;
      try {
        sessionId = JSON.parse(text) as string;
      } catch {
        return reply.status(401).send({
          error: "Incorrect username or password. Double-check your Dexcom Share credentials.",
        });
      }

      if (!sessionId || sessionId === ZERO_UUID) {
        return reply.status(401).send({
          error: "Incorrect username or password. Double-check your Dexcom Share credentials.",
        });
      }

      // Success — save credentials
      await query(
        `INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET settings = user_settings.settings || $2::jsonb`,
        [
          req.user_id,
          JSON.stringify({
            dexcom: {
              share_account_id: account_id,
              share_password: password,
              share_region: region ?? "us",
            },
          }),
        ]
      );
      return { ok: true, method: "id" };
    }
  );
}
