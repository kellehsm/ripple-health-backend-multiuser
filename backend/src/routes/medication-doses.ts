import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { getUserTz } from "../lib/userTz.js";

export default async function medicationDosesRoutes(app: FastifyInstance) {
  app.post("/mark-slot", async (req) => {
    const user_id = req.user_id;
    const { time_of_day, date } = req.body as any;
    // Log date is the user's local calendar day. Previously we used
    // CURRENT_DATE (server-local, EST) which meant a west-coast user
    // marking a dose at 10pm PT logged it under the *next* EST day and
    // the reader (also CURRENT_DATE) couldn't find it. Now both writer
    // and reader use (now() AT TIME ZONE $tz)::date.
    const tz = await getUserTz(user_id);
    await query(
      `INSERT INTO medication_dose_logs (user_id, medication_id, slot_id, log_date, status)
       SELECT $1, s.medication_id, s.id, COALESCE($3::date, (now() AT TIME ZONE $4)::date), 'taken'
       FROM medication_schedule_slots s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.user_id = $1 AND m.active = true AND s.time_of_day = $2
       ON CONFLICT (user_id, medication_id, slot_id, log_date) DO UPDATE SET status = 'taken', taken_at = now()`,
      [user_id, time_of_day, date ?? null, tz]
    );
    return { ok: true };
  });

  app.post("/mark-selected", async (req) => {
    const user_id = req.user_id;
    const { slot_ids, date } = req.body as any;
    const tz = await getUserTz(user_id);
    await query(
      `INSERT INTO medication_dose_logs (user_id, medication_id, slot_id, log_date, status)
       SELECT $1, s.medication_id, s.id, COALESCE($3::date, (now() AT TIME ZONE $4)::date), 'taken'
       FROM medication_schedule_slots s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.user_id = $1 AND s.id = ANY($2::uuid[])
       ON CONFLICT (user_id, medication_id, slot_id, log_date) DO UPDATE SET status = 'taken', taken_at = now()`,
      [user_id, slot_ids, date ?? null, tz]
    );
    return { ok: true };
  });

  // PRN (as-needed) doses have no slot — multiple per day are allowed since
  // NULL slot_id rows bypass the unique constraint.
  app.post("/prn", async (req) => {
    const user_id = req.user_id;
    const { medication_id } = req.body as any;
    const [row] = await query<any>(
      `INSERT INTO medication_dose_logs (user_id, medication_id, slot_id, log_date, status)
       SELECT $1, m.id, NULL, CURRENT_DATE, 'taken'
       FROM medications m WHERE m.id = $2 AND m.user_id = $1 AND m.is_prn = true
       RETURNING id, medication_id, log_date, taken_at`,
      [user_id, medication_id]
    );
    if (!row) throw { statusCode: 404, message: "PRN medication not found" };
    return row;
  });

  app.get("/prn-summary", async (req) => {
    const user_id = req.user_id;
    return query<any>(
      `SELECT medication_id,
              COUNT(*) FILTER (WHERE log_date = CURRENT_DATE)::int AS today_count,
              MAX(taken_at) AS last_taken,
              (ARRAY_AGG(id ORDER BY taken_at DESC) FILTER (WHERE log_date = CURRENT_DATE))[1] AS last_log_id
       FROM medication_dose_logs
       WHERE user_id = $1 AND slot_id IS NULL AND status = 'taken'
       GROUP BY medication_id`,
      [user_id]
    );
  });

  app.delete("/:id", async (req) => {
    const user_id = req.user_id;
    const { id } = req.params as any;
    await query(
      `DELETE FROM medication_dose_logs WHERE id = $1 AND user_id = $2`,
      [id, user_id]
    );
    return { ok: true };
  });
}
