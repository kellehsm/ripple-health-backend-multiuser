import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import dotenv from "dotenv";

import metricsRoutes from "./routes/metrics.js";
import booksRoutes from "./routes/books.js";
import booksSearchRoutes from "./routes/books-search.js";
import hobbiesRoutes from "./routes/hobbies.js";
import mealsRoutes from "./routes/meals.js";
import foodRoutes from "./routes/food.js";
import glucoseRoutes from "./routes/glucose.js";
import glucoseStatusRoutes from "./routes/glucose-status.js";
import dexcomAuthRoutes from "./routes/dexcom-auth.js";
import spendingRoutes from "./routes/spending.js";
import journalRoutes from "./routes/journal.js";
import summaryRoutes from "./routes/summary.js";
import healthConnectRoutes from "./routes/health-connect.js";
import heartRateRoutes from "./routes/heart-rate.js";
import settingsRoutes from "./routes/settings.js";
import exportRoutes from "./routes/export.js";
import searchRoutes from "./routes/search.js";
import googleAuthRoutes from "./routes/google-auth.js";
import googleDriveRoutes from "./routes/google-drive.js";
import substancesRoutes from "./routes/substances.js";
import completedRoutes from "./routes/completed.js";
import syncRoutes from "./routes/sync.js";
import analyticsRoutes from "./routes/analytics.js";
import insightsRoutes from "./routes/insights.js";
import recipesRoutes from "./routes/recipes.js";
import annotationsRoutes from "./routes/annotations.js";
import tabPreferencesRoutes from "./routes/tab-preferences.js";
import exerciseRoutes from "./routes/exercise.js";
import programRoutes from "./routes/programs.js";
import medicationsRoutes from "./routes/medications.js";
import medicationDosesRoutes from "./routes/medication-doses.js";
import medicationCategoriesRoutes from "./routes/medication-categories.js";
import medicationPrescribersRoutes from "./routes/medication-prescribers.js";
import cycleRoutes from "./routes/cycle.js";
import dashboardRoutes from "./routes/dashboard.js";
import hintsRoutes from "./routes/hints.js";
import mindfulnessRoutes from "./routes/mindfulness.js";
import mediaRoutes from "./routes/media.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import experimentsRoutes from "./routes/experiments.js";
import errorReportsRoutes from "./routes/error-reports.js";
import authRoutes from "./routes/auth.js";
import dexcomVerifyRoutes from "./routes/dexcom-verify.js";
import plaidRoutes from "./routes/plaid.js";
import friendsRoutes from "./routes/friends.js";
import challengesRoutes from "./routes/challenges.js";
import socialNotificationsRoutes from "./routes/social-notifications.js";
import hardcoverRoutes from "./routes/hardcover.js";
import { requireAuth } from "./middleware/auth.js";
import { createDownloadToken } from "./lib/downloadTokens.js";
import { backupToGoogleDrive } from "./jobs/google-drive-backup.js";
import { runDailySummaryJob } from "./jobs/dailySummaryJob.js";
import { runInsightsJob } from "./jobs/insightsJob.js";
import { syncDexcomShareGlucose } from "./jobs/dexcom-share-sync.js";
import { runHardcoverSyncJob } from "./jobs/hardcover-sync.js";
import cron from "node-cron";
import { query } from "./db.js";
import { encryptCredential, isEncrypted } from "./lib/credCrypto.js";
import { estYesterday } from "./lib/estDate.js";

dotenv.config();

// Fail fast on missing critical env vars — silent misconfiguration causes
// runtime errors deep inside handlers that are hard to trace.
const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET"];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  // eslint-disable-next-line no-console
  console.error(`[startup] Missing required env vars: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// trustProxy: Caddy fronts prod (app.kels.gg) and sets X-Forwarded-For —
// without this every request rate-limits against 127.0.0.1 as one shared bucket.
const app = Fastify({ logger: true, trustProxy: true });

// Treat an empty JSON body as {} — the app POSTs some bodiless actions (e.g.
// /hardcover/sync) with Content-Type: application/json, which Fastify would
// otherwise reject with FST_ERR_CTP_EMPTY_JSON_BODY.
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  // Keep the exact raw body around for webhook signature verification
  // (Plaid signs the sha256 of the raw request body — see routes/plaid.ts).
  (req as any).rawBody = body as string;
  const text = (body as string).trim();
  if (!text) return done(null, {});
  try {
    done(null, JSON.parse(text));
  } catch (err) {
    done(err as Error, undefined);
  }
});

// Routes that don't need authentication (auth itself + OAuth callbacks)
const PUBLIC_PREFIXES = ["/health", "/api/auth", "/auth/dexcom", "/auth/google", "/api/plaid/webhook", "/api/medications/import/template", "/admin/media"];

function isPublic(url: string): boolean {
  return PUBLIC_PREFIXES.some((p) => url === p || url.startsWith(p + "/") || url.startsWith(p + "?"));
}

async function main() {
  // Native app requests carry no Origin header (CORS never applies to them);
  // this list only governs browser contexts: the admin media tool (same-origin)
  // and local Expo web / dev-server access.
  await app.register(cors, {
    origin: [
      "https://app.kels.gg",
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/129\.121\.125\.214:\d+$/,
    ],
  });
  // CSP disabled: the only HTML served is the inline-scripted admin media tool.
  await app.register(helmet, { contentSecurityPolicy: false });
  // Global limiter is a generous safety net; strict per-route limits are set
  // on the credential endpoints in routes/auth.ts via config.rateLimit.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: "1 minute",
    // Key authenticated traffic by token (per-user buckets — also covers the
    // dashboard endpoint's internal app.inject() calls); anonymous by IP.
    keyGenerator: (req) => (req.headers.authorization as string | undefined) ?? req.ip,
  });

  // Global auth hook — runs before every handler except public routes
  app.addHook("onRequest", async (req, reply) => {
    if (isPublic(req.url)) return;
    await requireAuth(req, reply);
  });

  // Public routes
  app.get("/health", async () => ({ ok: true }));

  // Admin media manager — static single-page tool; login happens client-side
  const adminHtmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "admin/media-admin.html");
  app.get("/admin/media", async (_req, reply) => {
    reply.type("text/html");
    return fs.promises.readFile(adminHtmlPath, "utf8");
  });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(dexcomVerifyRoutes, { prefix: "/api/dexcom" });
  await app.register(dexcomAuthRoutes, { prefix: "/auth/dexcom" });
  await app.register(googleAuthRoutes, { prefix: "/auth/google" });
  await app.register(booksSearchRoutes, { prefix: "/api/books-search" });
  await app.register(foodRoutes, { prefix: "/api/food" });

  // Protected routes — user_id comes from req.user_id (set by auth hook)
  await app.register(metricsRoutes, { prefix: "/api/metrics" });
  await app.register(booksRoutes, { prefix: "/api/books" });
  await app.register(hobbiesRoutes, { prefix: "/api/hobbies" });
  await app.register(mealsRoutes, { prefix: "/api/meals" });
  await app.register(glucoseRoutes, { prefix: "/api/glucose" });
  await app.register(glucoseStatusRoutes, { prefix: "/api/glucose" });
  await app.register(spendingRoutes, { prefix: "/api/spending" });
  await app.register(plaidRoutes, { prefix: "/api/plaid" });
  await app.register(journalRoutes, { prefix: "/api/journal" });
  await app.register(summaryRoutes, { prefix: "/api/summary" });
  await app.register(healthConnectRoutes, { prefix: "/api/health-connect" });
  await app.register(heartRateRoutes, { prefix: "/api/heart-rate" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(exportRoutes, { prefix: "/api/export" });
  await app.register(searchRoutes, { prefix: "/api/search" });
  await app.register(googleDriveRoutes, { prefix: "/api/settings/google-drive" });
  await app.register(substancesRoutes, { prefix: "/api/substances" });
  await app.register(completedRoutes, { prefix: "/api/completed" });
  await app.register(syncRoutes, { prefix: "/api/sync" });
  await app.register(analyticsRoutes, { prefix: "/api/analytics" });
  await app.register(insightsRoutes, { prefix: "/api/insights" });
  await app.register(recipesRoutes, { prefix: "/api/recipes" });
  await app.register(annotationsRoutes, { prefix: "/api/annotations" });
  await app.register(tabPreferencesRoutes, { prefix: "/api/user/tab-preferences" });
  await app.register(exerciseRoutes, { prefix: "/api/exercise" });
  await app.register(programRoutes, { prefix: "/api/exercise" });
  await app.register(medicationsRoutes, { prefix: "/api/medications" });
  await app.register(medicationDosesRoutes, { prefix: "/api/medication-doses" });
  await app.register(medicationCategoriesRoutes, { prefix: "/api/medications/categories" });
  await app.register(medicationPrescribersRoutes, { prefix: "/api/medications/prescribers" });
  await app.register(cycleRoutes, { prefix: "/api/cycle" });
  await app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  await app.register(hintsRoutes, { prefix: "/api/hints" });
  await app.register(mindfulnessRoutes, { prefix: "/api/mindfulness" });
  await app.register(mediaRoutes, { prefix: "/api/media" });
  await app.register(errorReportsRoutes, { prefix: "/api/errors" });
  await app.register(experimentsRoutes, { prefix: "/api/experiments" });
  await app.register(friendsRoutes, { prefix: "/api/friends" });
  await app.register(challengesRoutes, { prefix: "/api/challenges" });
  await app.register(socialNotificationsRoutes, { prefix: "/api/social-notifications" });
  await app.register(hardcoverRoutes, { prefix: "/api/hardcover" });

  // Mints a short-lived (5 min), single-use token for URL-based downloads (?dl=...).
  // Keeps the long-lived JWT out of URLs, browser history, and server access logs.
  // Placed OUTSIDE /api/auth (public) so it goes through requireAuth.
  app.post("/api/download-token", async (req) => {
    return { token: createDownloadToken(req.user_id) };
  });

  const port = Number(process.env.PORT) || 4000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Wellness multi-user API running on port ${port}`);

  // One-time lazy migration: encrypt any legacy plaintext credentials at rest.
  // Runs on every boot but no-ops once everything is encrypted (or if no key set).
  void (async () => {
    if (!process.env.CRED_ENCRYPTION_KEY) {
      app.log.warn("CRED_ENCRYPTION_KEY not set — stored credentials remain plaintext");
      return;
    }
    try {
      const rows = await query<{ user_id: string; pw: string | null; hc: string | null }>(
        `SELECT user_id,
                settings->'dexcom'->>'share_password' AS pw,
                settings->'hardcover'->>'api_token'  AS hc
         FROM user_settings
         WHERE (settings->'dexcom'->>'share_password' IS NOT NULL AND settings->'dexcom'->>'share_password' NOT LIKE 'enc:v1:%')
            OR (settings->'hardcover'->>'api_token'  IS NOT NULL AND settings->'hardcover'->>'api_token'  NOT LIKE 'enc:v1:%')`
      );
      for (const { user_id, pw, hc } of rows) {
        if (pw && !isEncrypted(pw)) {
          await query(
            `UPDATE user_settings SET settings = jsonb_set(settings, '{dexcom,share_password}', to_jsonb($2::text)) WHERE user_id = $1`,
            [user_id, encryptCredential(pw)]
          );
        }
        if (hc && !isEncrypted(hc)) {
          await query(
            `UPDATE user_settings SET settings = jsonb_set(settings, '{hardcover,api_token}', to_jsonb($2::text)) WHERE user_id = $1`,
            [user_id, encryptCredential(hc)]
          );
        }
      }
      if (rows.length > 0) app.log.info({ users: rows.length }, "Encrypted legacy plaintext credentials");
    } catch (err) {
      app.log.error({ err }, "Credential encryption sweep failed");
    }
  })();

  // Daily Summary Engine — refresh today every 30 min; finalize yesterday at 1 AM
  cron.schedule("*/30 * * * *", () => void runDailySummaryJob());
  cron.schedule("0 1 * * *", () => {
    const yesterday = estYesterday();
    void runDailySummaryJob(yesterday);
  });
  void runDailySummaryJob(); // seed on startup
  app.log.info("Daily Summary Engine scheduled (every 30 min + startup)");

  // Insights Engine — nightly at 3 AM + on startup (low priority, after summaries)
  cron.schedule("0 3 * * *", () => void runInsightsJob());
  setTimeout(() => void runInsightsJob(), 15000); // 15s after boot so summaries seed first
  app.log.info("Insights Engine scheduled (nightly 3 AM + startup)");

  // Dexcom Share auto-sync — poll every 5 min for all users with Share configured
  const runDexcomShareSync = async () => {
    try {
      const users = await query<{ user_id: string; dexcom: Record<string, any> }>(
        `SELECT user_id, settings->'dexcom' AS dexcom FROM user_settings
         WHERE (
           (settings->'dexcom'->>'share_account_id' IS NOT NULL AND settings->'dexcom'->>'share_account_id' != '')
           OR (settings->'dexcom'->>'share_account_name' IS NOT NULL AND settings->'dexcom'->>'share_account_name' != '')
         )
           AND settings->'dexcom'->>'share_password' IS NOT NULL
           AND settings->'dexcom'->>'share_password' != ''`
      );
      for (const { user_id, dexcom } of users) {
        try {
          // Pass the already-fetched dexcom settings to avoid a redundant DB query inside the sync function
          const result = await syncDexcomShareGlucose(user_id, app.log, dexcom);
          if (result.inserted > 0) {
            app.log.info({ user_id, ...result }, "Dexcom Share sync: new readings");
          }
        } catch (err: any) {
          // Pass the Error itself so pino's built-in err serializer captures message + stack;
          // never pass the dexcom settings object (contains share_password).
          app.log.error({ err, user_id }, "Dexcom Share sync failed for user");
        }
      }
    } catch (err: any) {
      app.log.error({ err }, "Dexcom Share sync: failed to query users");
    }
  };
  cron.schedule("*/5 * * * *", () => void runDexcomShareSync());
  void runDexcomShareSync(); // run once on startup to catch any missed readings
  app.log.info("Dexcom Share sync scheduled (every 5 min + startup)");

  // Nightly sync_log TTL cleanup — delete rows older than 30 days
  cron.schedule("0 4 * * *", async () => {
    try {
      await query(`DELETE FROM sync_log WHERE processed_at < NOW() - INTERVAL '30 days'`);
      app.log.info("sync_log TTL cleanup completed");
    } catch (err: any) {
      app.log.error({ err: err?.message }, "sync_log TTL cleanup failed");
    }
  });
  app.log.info("sync_log TTL cleanup scheduled (nightly 4 AM)");

  // Nightly Google Drive backup — iterate over all users with Drive connected
  if (process.env.GOOGLE_CLIENT_ID) {
    cron.schedule("0 2 * * *", async () => {
      try {
        const users = await query<{ user_id: string }>(
          `SELECT user_id FROM user_settings WHERE settings->'google_drive'->>'connected' = 'true'`
        );
        for (const { user_id } of users) {
          try {
            const filename = await backupToGoogleDrive(user_id);
            app.log.info({ filename, user_id }, "Nightly Drive backup completed");
          } catch (err: any) {
            app.log.error({ err: err?.message, user_id }, "Nightly Drive backup failed");
          }
        }
      } catch (err: any) {
        app.log.error({ err: err?.message }, "Failed to fetch Drive backup users");
      }
    });
    app.log.info("Nightly Google Drive backup scheduled at 2:00 AM");
  }

  // Hardcover two-way sync — every 4 hours for all connected users
  cron.schedule("0 */4 * * *", () => void runHardcoverSyncJob(app.log));
  app.log.info("Hardcover sync scheduled (every 4 hours)");
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
