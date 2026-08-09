import { query } from "../db.js";
import { InsightRule, InsightResult, calcConfidence } from "./types.js";

// Uses substance_logs.abv_percent + volume_ml to compute grams of alcohol per
// day. Compares next-morning fasting glucose (min glucose 4-8am) between
// low-quantity and high-quantity nights. More granular than the prior "did
// you drink at all" alcoholVsMood rule.
export const AlcoholQuantityVsGlucoseRule: InsightRule = {
  id: "alcohol_quantity_vs_glucose",
  type: "glucose",
  minDays: 30,

  async run(userId: string, capabilities?): Promise<InsightResult | null> {
    if (!capabilities?.has_substances || !capabilities?.has_glucose) return null;

    const rows = await query<{ night_date: string; grams_alcohol: number; morning_glucose: number }>(
      `WITH nightly_alcohol AS (
        SELECT logged_at::date AS night_date,
               -- grams of alcohol = volume_ml * (abv_percent/100) * 0.789 (density)
               SUM((COALESCE(volume_ml, 0) * COALESCE(abv_percent, 0) / 100.0) * 0.789)::float8 AS grams_alcohol
        FROM substance_logs
        WHERE user_id = $1
          AND substance_type = 'alcohol'
          AND logged_at >= NOW() - INTERVAL '90 days'
          AND volume_ml IS NOT NULL AND abv_percent IS NOT NULL
          AND EXTRACT(HOUR FROM logged_at) >= 16 -- evening drinks only
        GROUP BY logged_at::date
      ),
      morning_bg AS (
        SELECT recorded_at::date AS morning_date,
               MIN(mg_dl)::float8 AS morning_glucose
        FROM glucose_readings
        WHERE user_id = $1
          AND recorded_at >= NOW() - INTERVAL '90 days'
          AND EXTRACT(HOUR FROM recorded_at) BETWEEN 4 AND 8
        GROUP BY recorded_at::date
        HAVING COUNT(*) >= 3
      )
      SELECT na.night_date::text,
             na.grams_alcohol,
             mb.morning_glucose
      FROM nightly_alcohol na
      JOIN morning_bg mb ON mb.morning_date = na.night_date + INTERVAL '1 day'`,
      [userId]
    );

    if (rows.length < 8) return null;

    // Light night = ≤14g (one standard drink), heavy = ≥28g (two+).
    const light = rows.filter((r) => Number(r.grams_alcohol) > 0 && Number(r.grams_alcohol) <= 14);
    const heavy = rows.filter((r) => Number(r.grams_alcohol) >= 28);
    if (light.length < 3 || heavy.length < 3) return null;

    const mean = (a: typeof rows) => a.reduce((s, r) => s + Number(r.morning_glucose), 0) / a.length;
    const glucLight = mean(light);
    const glucHeavy = mean(heavy);
    const diff = glucHeavy - glucLight;
    if (Math.abs(diff) < 4) return null;

    const effectRatio = Math.min(1, Math.abs(diff) / 30);
    const { score, label } = calcConfidence(Math.min(light.length, heavy.length), effectRatio);
    const direction = diff > 0 ? "higher" : "lower";

    return {
      title: `Heavier drinking nights → ${direction} morning glucose`,
      description: `Mornings after 2+ standard drinks, your fasting glucose averaged ${glucHeavy.toFixed(0)} mg/dL, compared to ${glucLight.toFixed(0)} mg/dL after one drink or less — a difference of ${Math.abs(diff).toFixed(0)} mg/dL.`,
      confidence: label,
      confidenceScore: score,
      timesObserved: rows.length,
      supportingData: {
        light_nights: light.length,
        heavy_nights: heavy.length,
        avg_morning_glucose_light: Math.round(glucLight),
        avg_morning_glucose_heavy: Math.round(glucHeavy),
        difference_mg_dl: Math.abs(diff).toFixed(0),
        direction,
      },
    };
  },
};
