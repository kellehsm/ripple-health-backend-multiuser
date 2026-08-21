import { FastifyInstance } from "fastify";
import { query } from "../db.js";
import { encryptCredential } from "../lib/credCrypto.js";
import { invalidateUserTz, isValidTz } from "../lib/userTz.js";

export default async function settingsRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const user_id = req.user_id;
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const settings = rows[0]?.settings ?? {};
    // Mask Dexcom password: return a boolean instead of the value
    if (settings.dexcom) {
      const { share_password, ...rest } = settings.dexcom;
      settings.dexcom = { ...rest, share_password_set: !!share_password };
    }
    // Mask Hardcover token: return a boolean instead of the value
    if (settings.hardcover) {
      const { api_token, ...rest } = settings.hardcover;
      settings.hardcover = { ...rest, token_set: !!api_token };
    }
    return settings;
  });

  // Allowlist of top-level settings keys clients are permitted to write.
  // Anything else in the PATCH body is silently dropped. Keeps clients from
  // flipping internal flags like workout_setup_complete or injecting
  // arbitrary future-sensitive keys.
  const ALLOWED_KEYS = new Set([
    "dexcom", "hardcover",
    "smart_notifications", "health_notifications", "health_connect",
    "week_start", "home_screen", "timezone",
    "sharing_prefs", "social_notification_prefs",
    "customize_dashboard", "background_images",
    "theme_palette", "app_appearance", "reduce_motion",
    "biometric_lock", "sick_day_mode",
    "onboarding_complete",
    "weather",
  ]);

  app.patch("/", async (req) => {
    const user_id = req.user_id;
    const rawPatch = (req.body ?? {}) as Record<string, any>;
    const patch: Record<string, any> = {};
    for (const k of Object.keys(rawPatch)) {
      if (ALLOWED_KEYS.has(k)) patch[k] = rawPatch[k];
    }
    // Reject garbage timezone strings before they land in the DB — a bad
    // IANA id would poison every date-boundary computation downstream.
    if ("timezone" in patch && !isValidTz(patch.timezone)) {
      delete patch.timezone;
    } else if ("timezone" in patch) {
      invalidateUserTz(user_id);
    }

    // Read existing settings once — needed for the Dexcom password guard and one-level deep merge.
    const rows = await query<any>("SELECT settings FROM user_settings WHERE user_id = $1", [user_id]);
    const existing = rows[0]?.settings ?? {};

    // One-level deep merge so nested keys (dexcom, week_start, etc.) are merged, not replaced
    const merged: Record<string, any> = { ...existing };
    for (const key of Object.keys(patch)) {
      if (
        patch[key] !== null &&
        typeof patch[key] === "object" &&
        !Array.isArray(patch[key]) &&
        merged[key] !== null &&
        typeof merged[key] === "object"
      ) {
        merged[key] = { ...merged[key], ...patch[key] };
      } else {
        merged[key] = patch[key];
      }
    }

    // Don't overwrite existing Dexcom password when an empty string is sent
    if (patch.dexcom?.share_password === "" && existing?.dexcom?.share_password) {
      merged.dexcom.share_password = existing.dexcom.share_password;
    }

    // Credentials are encrypted at rest (no-op if already encrypted or key unset)
    if (merged.dexcom?.share_password) {
      merged.dexcom.share_password = encryptCredential(merged.dexcom.share_password);
    }
    if (merged.hardcover?.api_token) {
      merged.hardcover.api_token = encryptCredential(merged.hardcover.api_token);
    }

    // Upsert: create row if it doesn't exist yet, otherwise merge the patch into existing settings
    await query(
      `INSERT INTO user_settings (user_id, settings)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id)
       DO UPDATE SET settings = user_settings.settings || $2::jsonb`,
      [user_id, JSON.stringify(merged)]
    );
    return { ok: true };
  });

  // Returns the most-recent successful sync timestamps for each integration.
  // The frontend uses these to detect when a data source has gone stale.
  app.get("/sync-status", async (req) => {
    const user_id = req.user_id;

    const [dexcomRow, stepsRow, sleepRow, hrRow, dexcomSession] = await Promise.all([
      // Dexcom / CGM: most recent glucose reading regardless of source
      query<any>(
        `SELECT recorded_at FROM glucose_readings WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
        [user_id]
      ),
      // Health Connect steps: most recent daily log
      query<any>(
        `SELECT ml.logged_at FROM metric_logs ml
         JOIN metrics m ON m.id = ml.metric_id
         WHERE m.user_id = $1 AND m.name = 'steps'
         ORDER BY ml.logged_at DESC LIMIT 1`,
        [user_id]
      ),
      // Health Connect sleep: most recent session end
      query<any>(
        `SELECT end_time AS logged_at FROM sleep_sessions WHERE user_id = $1 ORDER BY end_time DESC LIMIT 1`,
        [user_id]
      ),
      // Health Connect heart rate: most recent reading
      query<any>(
        `SELECT recorded_at FROM heart_rate_readings WHERE user_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
        [user_id]
      ),
      // Dexcom Share session validity — lets the UI distinguish "backend can
      // log in" from "readings just aren't arriving" (phone-side stall).
      query<any>(
        `SELECT expires_at FROM dexcom_share_sessions WHERE user_id = $1 AND expires_at > NOW()`,
        [user_id]
      ).catch(() => []),
    ]);

    return {
      dexcom_last_at:  dexcomRow[0]?.recorded_at ?? null,
      hc_steps_last_at: stepsRow[0]?.logged_at    ?? null,
      hc_sleep_last_at: sleepRow[0]?.logged_at    ?? null,
      hc_hr_last_at:   hrRow[0]?.recorded_at      ?? null,
      dexcom_session_valid: dexcomSession.length > 0,
      // db_ok is implied: if the queries above failed this handler would throw.
      server: { db_ok: true, uptime_secs: Math.round(process.uptime()) },
    };
  });
}
