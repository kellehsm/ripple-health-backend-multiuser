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
import { backupToGoogleDrive } from "./jobs/google-drive-backup.js";
import cron from "node-cron";

dotenv.config();

const app = Fastify({ logger: true });

async function main() {
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true }));

  await app.register(metricsRoutes, { prefix: "/api/metrics" });
  await app.register(booksRoutes, { prefix: "/api/books" });
  await app.register(booksSearchRoutes, { prefix: "/api/books-search" });
  await app.register(hobbiesRoutes, { prefix: "/api/hobbies" });
  await app.register(mealsRoutes, { prefix: "/api/meals" });
  await app.register(foodRoutes, { prefix: "/api/food" });
  await app.register(glucoseRoutes, { prefix: "/api/glucose" });
  await app.register(glucoseStatusRoutes, { prefix: "/api/glucose" });
  await app.register(dexcomAuthRoutes, { prefix: "/auth/dexcom" });
  await app.register(spendingRoutes, { prefix: "/api/spending" });
  await app.register(journalRoutes, { prefix: "/api/journal" });
  await app.register(summaryRoutes, { prefix: "/api/summary" });
  await app.register(healthConnectRoutes, { prefix: "/api/health-connect" });
  await app.register(heartRateRoutes, { prefix: "/api/heart-rate" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(exportRoutes, { prefix: "/api/export" });
  await app.register(searchRoutes, { prefix: "/api/search" });
  await app.register(googleAuthRoutes, { prefix: "/auth/google" });
  await app.register(googleDriveRoutes, { prefix: "/api/settings/google-drive" });
  await app.register(substancesRoutes, { prefix: "/api/substances" });
  await app.register(completedRoutes, { prefix: "/api/completed" });
  await app.register(syncRoutes, { prefix: "/api/sync" });
  await app.register(analyticsRoutes, { prefix: "/api/analytics" });

  const port = Number(process.env.PORT) || 4000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Wellness API running on port ${port}`);

  // Glucose sync is handled by the dedicated dexcom-share-worker systemd service.

  const userId = process.env.DEFAULT_USER_ID;

  // Nightly Google Drive backup at 2:00 AM
  if (userId && process.env.GOOGLE_CLIENT_ID) {
    cron.schedule("0 2 * * *", async () => {
      try {
        const filename = await backupToGoogleDrive(userId);
        app.log.info({ filename }, "Nightly Drive backup completed");
      } catch (err: any) {
        app.log.error({ err: err?.message }, "Nightly Drive backup failed");
      }
    });
    app.log.info("Nightly Google Drive backup scheduled at 2:00 AM");
  }
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
