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
  app.get("/doctor-report", async (req, reply: FastifyReply) => {
    const { user_id, start, end } = req.query as any;
    const startDate = start ? new Date(start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end) : new Date();
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // Fetch all needed data in parallel
    const [glucoseRows, mealRows, userRow] = await Promise.all([
      query<any>(
        `SELECT recorded_at, mg_dl, trend FROM glucose_readings
         WHERE user_id = $1 AND recorded_at BETWEEN $2 AND $3
         ORDER BY recorded_at`,
        [user_id, startIso, endIso]
      ),
      query<any>(
        `SELECT id, logged_at, name, carbs_g FROM meals
         WHERE user_id = $1 AND logged_at BETWEEN $2 AND $3
         ORDER BY logged_at`,
        [user_id, startIso, endIso]
      ),
      query<any>(`SELECT * FROM users WHERE id = $1`, [user_id]),
    ]);

    const firstName = (userRow[0] as any)?.display_name?.split(" ")[0] ?? "Patient";

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
      doc.fontSize(18).fillColor("#085041").text("Ripple Health — Doctor Report", { align: "center" });
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
        "Generated by Ripple Health · Personal data only, not a medical record",
        50,
        doc.page.height - 40,
        { align: "center", width: 512 }
      );

      doc.end();
    });

    const pdf = Buffer.concat(chunks);
    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="ripple-health-report-${startDate.toISOString().slice(0, 10)}.pdf"`)
      .send(pdf);
  });

  app.get("/all", async (req, reply: FastifyReply) => {
    const { user_id } = req.query as any;

    const [glucose, meals, journal, spending, books, hobbies, hobbiesLogs, sleep, heartRate, metrics, metricLogs] = await Promise.all([
      query<any>(`SELECT * FROM glucose_readings WHERE user_id = $1 ORDER BY recorded_at`, [user_id]),
      query<any>(`SELECT * FROM meals WHERE user_id = $1 ORDER BY logged_at`, [user_id]),
      query<any>(`SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY logged_at`, [user_id]),
      query<any>(`SELECT * FROM spending_entries WHERE user_id = $1 ORDER BY logged_at`, [user_id]),
      query<any>(`SELECT * FROM books WHERE user_id = $1`, [user_id]),
      query<any>(`SELECT * FROM hobbies WHERE user_id = $1`, [user_id]),
      query<any>(`SELECT hl.* FROM hobby_logs hl JOIN hobbies h ON h.id = hl.hobby_id WHERE h.user_id = $1 ORDER BY hl.logged_at`, [user_id]),
      query<any>(`SELECT * FROM sleep_sessions WHERE user_id = $1 ORDER BY start_time`, [user_id]),
      query<any>(`SELECT * FROM heart_rate_readings WHERE user_id = $1 ORDER BY recorded_at`, [user_id]),
      query<any>(`SELECT * FROM metrics WHERE user_id = $1`, [user_id]),
      query<any>(`SELECT ml.* FROM metric_logs ml JOIN metrics m ON m.id = ml.metric_id WHERE m.user_id = $1 ORDER BY ml.logged_at`, [user_id]),
    ]);

    const payload = JSON.stringify({
      exported_at: new Date().toISOString(),
      user_id,
      glucose,
      meals,
      journal,
      spending,
      books,
      hobbies,
      hobby_logs: hobbiesLogs,
      sleep_sessions: sleep,
      heart_rate: heartRate,
      metrics,
      metric_logs: metricLogs,
    }, null, 2);

    const date = new Date().toISOString().slice(0, 10);
    reply
      .header("Content-Type", "application/json")
      .header("Content-Disposition", `attachment; filename="ripple-backup-${date}.json"`)
      .send(payload);
  });
}
