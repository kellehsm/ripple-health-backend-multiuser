import { FastifyInstance } from "fastify";
import { query } from "../db.js";

export default async function medicationDosesRoutes(app: FastifyInstance) {
  app.post("/mark-slot", async (req) => {
    const user_id = req.user_id;
    const { time_of_day, date } = req.body as any;
    const logDate = date ?? new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO medication_dose_logs (user_id, medication_id, slot_id, log_date, status)
       SELECT $1, s.medication_id, s.id, $3::date, 'taken'
       FROM medication_schedule_slots s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.user_id = $1 AND m.active = true AND s.time_of_day = $2
       ON CONFLICT (user_id, medication_id, slot_id, log_date) DO UPDATE SET status = 'taken', taken_at = now()`,
      [user_id, time_of_day, logDate]
    );
    return { ok: true };
  });

  app.post("/mark-selected", async (req) => {
    const user_id = req.user_id;
    const { slot_ids, date } = req.body as any;
    const logDate = date ?? new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO medication_dose_logs (user_id, medication_id, slot_id, log_date, status)
       SELECT $1, s.medication_id, s.id, $3::date, 'taken'
       FROM medication_schedule_slots s
       JOIN medications m ON m.id = s.medication_id
       WHERE m.user_id = $1 AND s.id = ANY($2::uuid[])
       ON CONFLICT (user_id, medication_id, slot_id, log_date) DO UPDATE SET status = 'taken', taken_at = now()`,
      [user_id, slot_ids, logDate]
    );
    return { ok: true };
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
