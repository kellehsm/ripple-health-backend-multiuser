import { FastifyInstance, FastifyReply } from "fastify";
import { query } from "../db.js";
import PDFDocument from "pdfkit";

const HIGH_THRESHOLD = 180;
const LOW_THRESHOLD = 70;

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function drawGlucoseChart(
  doc: PDFKit.PDFDocument,
  readings: Array<{ recorded_at: string; mg_dl: number }>,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (readings.length === 0) return;

  const times = readings.map((r) => new Date(r.recorded_at).getTime());
  const values = readings.map((r) => Number(r.mg_dl));
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const vMin = Math.max(40, Math.min(...values) - 10);
  const vMax = Math.min(400, Math.max(...values) + 10);
  const tRange = tMax - tMin || 1;
  const vRange = vMax - vMin || 1;

  // Background
  doc.rect(x, y, w, h).fillAndStroke("#f9f9f9", "#cccccc");

  // Grid lines + labels at 70, 140, 180, 250
  const gridLines = [70, 140, 180, 250].filter((v) => v >= vMin && v <= vMax);
  doc.fontSize(7).fillColor("#888888");
  for (const v of gridLines) {
    const gy = y + h - ((v - vMin) / vRange) * h;
    doc.moveTo(x, gy).lineTo(x + w, gy).dash(2, { space: 3 }).stroke("#cccccc").undash();
    doc.text(String(v), x - 24, gy - 4);
  }

  // High/low zone bands
  const highY = y + h - ((HIGH_THRESHOLD - vMin) / vRange) * h;
  const lowY = y + h - ((LOW_THRESHOLD - vMin) / vRange) * h;
  doc.rect(x, y, w, highY - y).fill("rgba(255,200,200,0.15)");
  doc.rect(x, lowY, w, y + h - lowY).fill("rgba(200,200,255,0.15)");

  // Polyline
  doc.strokeColor("#149D74").lineWidth(1.5);
  let first = true;
  for (const r of readings) {
    const px = x + ((new Date(r.recorded_at).getTime() - tMin) / tRange) * w;
    const py = y + h - ((Number(r.mg_dl) - vMin) / vRange) * h;
    if (first) { doc.moveTo(px, py); first = false; }
    else doc.lineTo(px, py);
  }
  doc.stroke();

  // Axis labels
  doc.fontSize(7).fillColor("#555555");
  doc.text(fmtTime(new Date(tMin)), x, y + h + 4, { width: 60 });
  doc.text(fmtTime(new Date(tMax)), x + w - 60, y + h + 4, { align: "right", width: 60 });
  doc.fillColor("#000000");
}

export default async function exportRoutes(app: FastifyInstance) {
  app.get("/doctor-report", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async (req, reply: FastifyReply) => {
    const user_id = req.user_id;
    const { start, end } = req.query as any;
    const startDate = start ? new Date(start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end) : new Date();
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    try {
    // Fetch all needed data in parallel
    const [glucoseRows, mealRows, userRow] = await Promise.all([
      query<any>(
        `SELECT recorded_at, mg_dl, trend FROM glucose_readings
         WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3
         ORDER BY recorded_at`,
        [user_id, startIso, endIso]
      ),
      query<any>(
        `SELECT id, logged_at, name, carbs_g, sugar_g, calories, caffeine_mg,
                sodium_mg, servings, meal_type
         FROM meals
         WHERE user_id = $1 AND logged_at BETWEEN $2 AND $3
         ORDER BY logged_at`,
        [user_id, startIso, endIso]
      ),
      query<any>(`SELECT email FROM users WHERE id = $1`, [user_id]),
    ]);

    const email = (userRow[0] as any)?.email ?? "";
    const firstName = email.split("@")[0] || "Patient";

    // Glucose stats
    const mgValues = glucoseRows.map((r: any) => Number(r.mg_dl));
    const avgGlucose = mgValues.length
      ? Math.round(mgValues.reduce((a: number, b: number) => a + b, 0) / mgValues.length)
      : null;
    const maxGlucose = mgValues.length ? Math.max(...mgValues) : null;
    const minGlucose = mgValues.length ? Math.min(...mgValues) : null;
    const inRange = mgValues.filter((v: number) => v >= LOW_THRESHOLD && v <= HIGH_THRESHOLD).length;
    const tirPct = mgValues.length ? Math.round((inRange / mgValues.length) * 100) : null;

    // Notable events: high/low readings
    const highEvents = glucoseRows.filter((r: any) => Number(r.mg_dl) > HIGH_THRESHOLD);
    const lowEvents = glucoseRows.filter((r: any) => Number(r.mg_dl) < LOW_THRESHOLD);

    // Meal-glucose correlation: for each meal, find glucose 60-90min after
    const mealTable: Array<{
      name: string;
      time: string;
      carbs: string;
      postMealGlucose: string;
    }> = [];
    for (const meal of mealRows as any[]) {
      const mealTime = new Date(meal.logged_at).getTime();
      const windowStart = mealTime + 60 * 60 * 1000;
      const windowEnd = mealTime + 90 * 60 * 1000;
      const postReadings = glucoseRows.filter((r: any) => {
        const t = new Date(r.recorded_at).getTime();
        return t >= windowStart && t <= windowEnd;
      });
      const postAvg = postReadings.length
        ? Math.round(
            postReadings.reduce((s: number, r: any) => s + Number(r.mg_dl), 0) / postReadings.length
          )
        : null;
      mealTable.push({
        name: meal.name ?? "Unknown",
        time: fmtTime(new Date(meal.logged_at)) + " " + new Date(meal.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        carbs: meal.carbs_g != null ? meal.carbs_g + "g carbs" : "—",
        postMealGlucose: postAvg != null ? postAvg + " mg/dL" : "no data",
      });
    }

    // Build PDF
    const doc = new PDFDocument({ size: "LETTER", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));

    await new Promise<void>((resolve) => {
      doc.on("end", resolve);

      // Header
      doc.fontSize(18).fillColor("#085041").text("Ripple Wellness — Doctor Report", { align: "center" });
      doc.fontSize(10).fillColor("#444444")
        .text(`Patient: ${firstName}`, { align: "center" })
        .text(`Period: ${fmtDate(startDate)} – ${fmtDate(endDate)}`, { align: "center" })
        .text(`Generated: ${fmtDate(new Date())}`, { align: "center" });
      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke("#cccccc");
      doc.moveDown(0.5);

      // Glucose Summary
      doc.fontSize(13).fillColor("#000000").text("Glucose Summary");
      doc.fontSize(10).fillColor("#333333");
      if (mgValues.length === 0) {
        doc.text("No glucose readings recorded in this period.");
      } else {
        doc.text(`Readings: ${mgValues.length}   Avg: ${avgGlucose} mg/dL   High: ${maxGlucose} mg/dL   Low: ${minGlucose} mg/dL`);
        doc.text(`Time in range (70–180 mg/dL): ${tirPct}%`);
        doc.text(`High events (>${HIGH_THRESHOLD}): ${highEvents.length}   Low events (<${LOW_THRESHOLD}): ${lowEvents.length}`);
      }
      doc.moveDown();

      // Glucose Chart
      if (glucoseRows.length > 0) {
        doc.fontSize(13).fillColor("#000000").text("Glucose Trend");
        doc.moveDown(0.3);
        const chartY = doc.y;
        drawGlucoseChart(doc, glucoseRows, 74, chartY, 462, 160);
        doc.y = chartY + 175;
        doc.moveDown();
      }

      // Meal-Glucose Correlation Table
      if (mealTable.length > 0) {
        doc.fontSize(13).fillColor("#000000").text("Meal Timing & Post-Meal Glucose (60–90 min after)");
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor("#000000");

        // Table header
        const cols = [180, 130, 90, 100];
        const headers = ["Meal", "Time", "Carbs", "Glucose at 60–90m"];
        let cx = 50;
        doc.font("Helvetica-Bold");
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], cx, doc.y, { width: cols[i], continued: i < headers.length - 1 });
          cx += cols[i];
        }
        doc.font("Helvetica");
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(562, doc.y).stroke("#cccccc");
        doc.moveDown(0.2);

        const shown = mealTable.slice(0, 25);
        for (const row of shown) {
          const rowY = doc.y;
          cx = 50;
          const cells = [row.name, row.time, row.carbs, row.postMealGlucose];
          // Check if there's room on the page
          if (rowY + 20 > doc.page.height - 60) {
            doc.addPage();
          }
          for (let i = 0; i < cells.length; i++) {
            doc.text(cells[i], cx, doc.y, { width: cols[i], continued: i < cells.length - 1 });
            cx += cols[i];
          }
          doc.moveDown(0.3);
        }
        if (mealTable.length > 25) {
          doc.fontSize(8).fillColor("#666666").text(`… and ${mealTable.length - 25} more meals not shown.`);
        }
        doc.moveDown();
      }

      // Notable Events
      if (highEvents.length > 0 || lowEvents.length > 0) {
        if (doc.y > doc.page.height - 120) doc.addPage();
        doc.fontSize(13).fillColor("#000000").text("Notable Events");
        doc.fontSize(9).fillColor("#333333");
        const events = [
          ...highEvents.map((r: any) => ({
            time: fmtTime(new Date(r.recorded_at)) + " " + new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            label: `HIGH: ${r.mg_dl} mg/dL`,
          })),
          ...lowEvents.map((r: any) => ({
            time: fmtTime(new Date(r.recorded_at)) + " " + new Date(r.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            label: `LOW: ${r.mg_dl} mg/dL`,
          })),
        ].sort((a, b) => a.time.localeCompare(b.time)).slice(0, 20);

        for (const ev of events) {
          doc.text(`${ev.time}  —  ${ev.label}`);
        }
        if (highEvents.length + lowEvents.length > 20) {
          doc.fontSize(8).fillColor("#666666").text(`… and ${highEvents.length + lowEvents.length - 20} more events not shown.`);
        }
      }

      // Footer
      doc.fontSize(8).fillColor("#999999");
      doc.text(
        "Generated by Ripple Wellness · Personal data only, not a medical record",
        50,
        doc.page.height - 40,
        { align: "center", width: 512 }
      );

      doc.end();
    });

    const pdf = Buffer.concat(chunks);
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="ripple-wellness-report-${startDate.toISOString().slice(0, 10)}.pdf"`)
      .send(pdf);
    } catch (err) {
      if (!reply.sent) {
        reply.code(500).send({ error: "Failed to generate report" });
      } else {
        reply.raw.destroy();
      }
    }
  });

  app.get("/all", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async (req, reply: FastifyReply) => {
    const user_id = req.user_id;
    const LIMIT = 10000;
    const date = new Date().toISOString().slice(0, 10);

    reply
      .header("Content-Type", "application/json")
      .header("Content-Disposition", `attachment; filename="ripple-backup-${date}.json"`);

    const raw = reply.raw;
    raw.write(`{"exported_at":${JSON.stringify(new Date().toISOString())}`);

    type TableSpec = { key: string; sql: string };
    const tables: TableSpec[] = [
      { key: "glucose",      sql: `SELECT id, user_id, recorded_at, mg_dl, trend, source FROM glucose_readings WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT ${LIMIT}` },
      { key: "meals",        sql: `SELECT id, user_id, logged_at, name, meal_type, carbs_g, sugar_g, calories, source_db, source_food_id, context, servings FROM meals WHERE user_id = $1 ORDER BY logged_at DESC LIMIT ${LIMIT}` },
      { key: "journal",      sql: `SELECT id, user_id, logged_at, mood_score, entry_text, context, mood_label, period, entry_type FROM journal_entries WHERE user_id = $1 ORDER BY logged_at DESC LIMIT ${LIMIT}` },
      { key: "spending",     sql: `SELECT id, user_id, logged_at, amount, category, source, tag FROM spending_entries WHERE user_id = $1 ORDER BY logged_at DESC LIMIT ${LIMIT}` },
      { key: "books",        sql: `SELECT id, user_id, title, author, cover_url, total_pages, status, rating, started_at, finished_at, total_chapters, current_chapter, hardcover_id, updated_at, hardcover_synced_at FROM books WHERE user_id = $1 LIMIT ${LIMIT}` },
      { key: "hobbies",      sql: `SELECT id, user_id, name, unit_label, icon, color_key, completed_at FROM hobbies WHERE user_id = $1 LIMIT ${LIMIT}` },
      { key: "hobby_logs",   sql: `SELECT hl.id, hl.hobby_id, hl.logged_at, hl.amount, hl.rating, hl.note FROM hobby_logs hl JOIN hobbies h ON h.id = hl.hobby_id WHERE h.user_id = $1 ORDER BY hl.logged_at DESC LIMIT ${LIMIT}` },
      { key: "sleep_sessions", sql: `SELECT id, user_id, start_time, end_time, quality_score, source, deep_ms, rem_ms, light_ms, awake_ms FROM sleep_sessions WHERE user_id = $1 ORDER BY start_time DESC LIMIT ${LIMIT}` },
      { key: "heart_rate",   sql: `SELECT id, user_id, recorded_at, bpm, source FROM heart_rate_readings WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT ${LIMIT}` },
      { key: "metrics",      sql: `SELECT id, user_id, name, value_type, unit, icon, color_key FROM metrics WHERE user_id = $1 LIMIT ${LIMIT}` },
      { key: "metric_logs",  sql: `SELECT ml.id, ml.metric_id, ml.logged_at, ml.value, ml.note FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id WHERE m.user_id = $1 ORDER BY ml.logged_at DESC LIMIT ${LIMIT}` },
    ];

    for (const { key, sql } of tables) {
      const rows = await query<any>(sql, [user_id]);
      raw.write(`,"${key}":${JSON.stringify(rows)}`);
    }

    await new Promise<void>((resolve, reject) => {
      raw.end("}", (err?: Error | null) => err ? reject(err) : resolve());
    });
  });

  /**
   * GET /export/weekly-digest.pdf — a one-page summary of the past week's
   * top insights + streaks + key metric shifts. Meant to be shared with a
   * doctor or saved as a personal record.
   */
  app.get("/weekly-digest.pdf", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async (req, reply: FastifyReply) => {
    const user_id = req.user_id;

    try {
    const insights = await query<any>(
      `SELECT title, description, confidence, confidence_score, type
       FROM user_insights
       WHERE user_id = $1 AND status = 'active' AND dismissed = FALSE
         AND NOT (supporting_data ? 'duplicate_of')
       ORDER BY pinned DESC NULLS LAST,
                COALESCE(rank_score, confidence_score / 100.0) DESC
       LIMIT 8`,
      [user_id]
    );

    const trends = await query<{ date: string; summary_data: any }>(
      `SELECT date::text AS date, summary_data
       FROM daily_summaries
       WHERE user_id = $1 AND date >= CURRENT_DATE - 7
       ORDER BY date`,
      [user_id]
    );

    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="ripple-weekly-digest-${new Date().toISOString().slice(0, 10)}.pdf"`);
    doc.pipe(reply.raw);

    doc.fontSize(24).fillColor("#111").text("Ripple Wellness — Weekly Digest", { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor("#666").text(fmtDate(new Date()));
    doc.moveDown(1);

    doc.fontSize(14).fillColor("#111").text("Top insights this week", { underline: false });
    doc.moveDown(0.5);
    if (insights.length === 0) {
      doc.fontSize(10).fillColor("#666").text("No active insights yet — keep logging to build your pattern library.");
    } else {
      for (const i of insights) {
        doc.fontSize(11).fillColor("#111").text(`• ${i.title}`);
        doc.fontSize(9).fillColor("#555").text(i.description, { indent: 12 });
        doc.fontSize(8).fillColor("#888").text(`   confidence: ${i.confidence} (${Number(i.confidence_score).toFixed(0)})`);
        doc.moveDown(0.4);
      }
    }

    doc.moveDown(0.6);
    doc.fontSize(14).fillColor("#111").text("Key metric averages (last 7 days)");
    doc.moveDown(0.3);

    const avg = (key: string, sub: string) => {
      const vals = trends
        .map((t) => {
          const v = t.summary_data?.[key]?.[sub];
          return v != null ? Number(v) : null;
        })
        .filter((v): v is number => v != null && Number.isFinite(v));
      return vals.length ? (vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    };

    const rows: Array<[string, string]> = [
      ["Sleep (min)",       avg("sleep", "minutes")?.toFixed(0) ?? "—"],
      ["Steps",             avg("activity", "steps")?.toFixed(0) ?? "—"],
      ["Mood (/5)",         avg("mood", "averageScore")?.toFixed(2) ?? "—"],
      ["Glucose (mg/dL)",   avg("glucose", "average")?.toFixed(0) ?? "—"],
      ["Water (glasses)",   avg("water", "glasses")?.toFixed(1) ?? "—"],
    ];
    for (const [label, val] of rows) {
      doc.fontSize(10).fillColor("#111").text(label, { continued: true, width: 200 })
         .fillColor("#555").text(`  ${val}`, { align: "left" });
    }

    doc.moveDown(1.4);
    doc.fontSize(8).fillColor("#888").text(
      "Descriptive summary only. This is not medical advice. Discuss any concerns with your healthcare provider.",
      { align: "center", width: 480 }
    );
    doc.end();
    } catch (err) {
      if (!reply.sent) {
        reply.code(500).send({ error: "Failed to generate digest" });
      } else {
        reply.raw.destroy();
      }
    }
  });

  /**
   * GET /export/trends.csv?metric=<mood|steps|sleep|glucose>&days=90
   * Daily rows for the requested metric.
   */
  app.get("/trends.csv", async (req, reply: FastifyReply) => {
    const user_id = req.user_id;
    const { metric = "steps", days = "90" } = req.query as any;
    const daysNum = Math.min(365, Math.max(7, parseInt(String(days), 10) || 90));

    const METRIC_PATH: Record<string, [string, string]> = {
      mood:    ["mood", "averageScore"],
      steps:   ["activity", "steps"],
      sleep:   ["sleep", "minutes"],
      glucose: ["glucose", "average"],
      water:   ["water", "glasses"],
      hr:      ["heartRate", "resting"],
    };
    const path = METRIC_PATH[String(metric)];
    if (!path) return reply.code(400).send({ error: "unknown metric" });

    const rows = await query<{ date: string; v: any }>(
      `SELECT date::text AS date, summary_data->'${path[0]}'->>'${path[1]}' AS v
       FROM daily_summaries
       WHERE user_id = $1 AND date >= CURRENT_DATE - $2::int
       ORDER BY date`,
      [user_id, daysNum]
    );

    const csv = ["date,value"]
      .concat(rows.map((r) => `${r.date},${r.v ?? ""}`))
      .join("\n");

    reply
      .header("Content-Type", "text/csv")
      .header("Content-Disposition", `attachment; filename="ripple-${metric}-${daysNum}d.csv"`)
      .send(csv);
  });
}
