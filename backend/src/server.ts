import Fastify from "fastify";
import cors from "@fastify/cors";
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
import authRoutes from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";
import { backupToGoogleDrive } from "./jobs/google-drive-backup.js";
import cron from "node-cron";
import { query } from "./db.js";

dotenv.config();

const app = Fastify({ logger: true });

// Routes that don't need authentication (auth itself + OAuth callbacks)
const PUBLIC_PREFIXES = ["/health", "/api/auth", "/auth/dexcom", "/auth/google"];

function isPublic(url: string): boolean {
  return PUBLIC_PREFIXES.some((p) => url === p || url.startsWith(p + "/") || url.startsWith(p + "?"));
}

async function main() {
  await app.register(cors, { origin: true });

  // Global auth hook — runs before every handler except public routes
  app.addHook("onRequest", async (req, reply) => {
    if (isPublic(req.url)) return;
    await requireAuth(req, reply);
  });

  // Public routes
  app.get("/health", async () => ({ ok: true }));
  await app.register(authRoutes, { prefix: "/api/auth" });
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

  const port = Number(process.env.PORT) || 4000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Wellness multi-user API running on port ${port}`);

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
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
