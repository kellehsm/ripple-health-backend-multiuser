/**
 * Weather sync service — fetches daily weather data from Open-Meteo
 * (free, no API key required) and upserts into weather_daily.
 *
 * Forecast endpoint:  https://api.open-meteo.com/v1/forecast
 * Archive endpoint:   https://archive-api.open-meteo.com/v1/archive
 *
 * Scheduled daily (called from server.ts). On first run per user (no rows yet)
 * it backfills the last 90 days from the archive API.
 */

import { query } from "../db.js";

const DAILY_VARS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "rain_sum",
  "snowfall_sum",
  "precipitation_hours",
  "sunshine_duration",
  "weathercode",
  "cloudcover_mean",
].join(",");

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_sum?: number[];
  rain_sum?: number[];
  snowfall_sum?: number[];
  precipitation_hours?: number[];
  sunshine_duration?: number[];  // seconds; divide by 60 for minutes
  weathercode?: number[];
  cloudcover_mean?: number[];
}

interface OpenMeteoResponse {
  daily?: OpenMeteoDaily;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchWeather(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  useArchive: boolean,
): Promise<OpenMeteoDaily | null> {
  const base = useArchive
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";

  const url =
    `${base}?latitude=${lat}&longitude=${lon}` +
    `&daily=${DAILY_VARS}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&timezone=UTC`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      console.error(`[weatherSync] HTTP ${res.status} from Open-Meteo`);
      return null;
    }
    const json = (await res.json()) as OpenMeteoResponse;
    return json.daily ?? null;
  } catch (err: any) {
    console.error("[weatherSync] fetch error:", err?.message ?? err);
    return null;
  }
}

async function upsertDailyRows(
  userId: string,
  daily: OpenMeteoDaily,
): Promise<number> {
  if (!daily.time?.length) return 0;
  let count = 0;
  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i];
    const sunlightSec = daily.sunshine_duration?.[i];
    const daylightMin =
      sunlightSec != null && Number.isFinite(sunlightSec)
        ? Math.round(sunlightSec / 60)
        : null;

    await query(
      `INSERT INTO weather_daily
         (user_id, date, temp_max_c, temp_min_c, precipitation_mm,
          rain_hours, snow_mm, daylight_minutes, weather_code, cloud_cover_pct, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
       ON CONFLICT (user_id, date) DO UPDATE SET
         temp_max_c       = EXCLUDED.temp_max_c,
         temp_min_c       = EXCLUDED.temp_min_c,
         precipitation_mm = EXCLUDED.precipitation_mm,
         rain_hours       = EXCLUDED.rain_hours,
         snow_mm          = EXCLUDED.snow_mm,
         daylight_minutes = EXCLUDED.daylight_minutes,
         weather_code     = EXCLUDED.weather_code,
         cloud_cover_pct  = EXCLUDED.cloud_cover_pct,
         updated_at       = NOW()`,
      [
        userId,
        date,
        daily.temperature_2m_max?.[i] ?? null,
        daily.temperature_2m_min?.[i] ?? null,
        daily.precipitation_sum?.[i] ?? null,
        daily.precipitation_hours?.[i] ?? null,
        daily.snowfall_sum?.[i] ?? null,
        daylightMin,
        daily.weathercode?.[i] ?? null,
        daily.cloudcover_mean?.[i] != null
          ? Math.round(daily.cloudcover_mean[i]!)
          : null,
      ],
    );
    count++;
  }
  return count;
}

export async function runWeatherSyncJob(): Promise<void> {
  // Fetch all users who have a weather location configured
  const users = await query<{
    user_id: string;
    lat: string;
    lon: string;
  }>(
    `SELECT user_id,
            (settings->'weather'->>'lat')::text AS lat,
            (settings->'weather'->>'lon')::text AS lon
     FROM user_settings
     WHERE settings->'weather'->>'lat' IS NOT NULL
       AND settings->'weather'->>'lon' IS NOT NULL`,
  );

  if (users.length === 0) return;

  const today = toISO(new Date());
  const yesterday = toISO(new Date(Date.now() - 86_400_000));

  for (const { user_id, lat, lon } of users) {
    try {
      const latN = parseFloat(lat);
      const lonN = parseFloat(lon);
      if (!Number.isFinite(latN) || !Number.isFinite(lonN)) continue;

      // Check whether this user already has any weather rows
      const [countRow] = await query<{ c: string }>(
        `SELECT COUNT(*) AS c FROM weather_daily WHERE user_id = $1`,
        [user_id],
      );
      const hasRows = Number(countRow?.c ?? 0) > 0;

      if (!hasRows) {
        // First run: backfill last 90 days from archive API
        const start = toISO(new Date(Date.now() - 90 * 86_400_000));
        // Archive only goes up to ~5 days ago; bridge with forecast for recents
        const archiveEnd = toISO(new Date(Date.now() - 5 * 86_400_000));

        const archiveDaily = await fetchWeather(latN, lonN, start, archiveEnd, true);
        if (archiveDaily) {
          const n = await upsertDailyRows(user_id, archiveDaily);
          console.info(`[weatherSync] backfilled ${n} days for user ${user_id}`);
        }
      }

      // Always sync yesterday + today from the forecast API
      const recent = await fetchWeather(latN, lonN, yesterday, today, false);
      if (recent) {
        await upsertDailyRows(user_id, recent);
      }
    } catch (err: any) {
      console.error(`[weatherSync] failed for user ${user_id}:`, err?.message ?? err);
    }
  }
}
