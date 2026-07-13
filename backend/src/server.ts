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
import { syncDexcomShareGlucose } from "./jobs/dexcom-share-sync.js";

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

  const port = Number(process.env.PORT) || 4000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Wellness API running on port ${port}`);

  const userId = process.env.DEFAULT_USER_ID;
  if (userId) {
    const FIVE_MINUTES = 5 * 60 * 1000;
    setInterval(async () => {
      try {
        const result = await syncDexcomShareGlucose(userId);
        app.log.info({ result }, "Dexcom auto-sync completed");
      } catch (err) {
        app.log.error({ err }, "Dexcom auto-sync failed");
      }
    }, FIVE_MINUTES);
    app.log.info("Dexcom auto-sync scheduled every 5 minutes");
  } else {
    app.log.warn("DEFAULT_USER_ID not set - Dexcom auto-sync disabled");
  }
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
