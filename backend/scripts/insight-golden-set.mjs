#!/usr/bin/env node
/**
 * Insight-engine golden-set regression tests.
 *
 * Runs each stats helper against known inputs and asserts the expected
 * outputs (within tolerance). If any of these drift, the engine's numbers
 * have shifted — likely a regression.
 *
 * Doesn't hit the database. Doesn't need Fastify. Pure functions only.
 *
 * Run: node backend/scripts/insight-golden-set.mjs
 */

// Compile stats.ts on the fly via tsx.
import { spawnSync } from "node:child_process";

const runner = spawnSync(
  "npx",
  ["tsx", new URL("./insight-golden-set.impl.ts", import.meta.url).pathname],
  { cwd: new URL("..", import.meta.url).pathname, stdio: "inherit" }
);
process.exit(runner.status ?? 0);
