// One-off backfill for the demo user — computes daily_summaries for every
// day in the seed window, then triggers the insights engine for that user
// so we can see rules fire against fresh personalized data.
//
// Usage: DATABASE_URL=<url> tsx --project <backend tsconfig> backfill-demo.mjs
// Or:    node --loader tsx/esm backfill-demo.mjs  (with DATABASE_URL set)

const DEMO_ID = "c51b97ef-10fc-4369-873a-972b657bcfcf";
const START = new Date("2026-04-22T00:00:00Z");
const END   = new Date("2026-08-09T00:00:00Z");

async function main() {
  const { generateDailySummary } = await import("./src/services/dailySummaryService.ts");
  const { runInsightsForUser }   = await import("./src/services/insightsEngine.ts");

  let count = 0;
  for (let d = new Date(START); d <= END; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    try {
      await generateDailySummary(DEMO_ID, dateStr);
      count++;
    } catch (err) {
      console.error(`  ${dateStr} failed:`, err?.message ?? err);
    }
  }
  console.log(`Backfilled ${count} daily_summaries for demo user.`);

  const result = await runInsightsForUser(DEMO_ID);
  console.log(`Insights engine result:`, JSON.stringify(result, null, 2));
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
