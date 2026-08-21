/**
 * Hot nights (temp_min above user's p75) vs cool nights: sleep duration + quality.
 *
 * Uses Welch's t-test + MDE + FDR across two metrics.
 * Tier: semiweekly.
 */

import type { InsightRule, InsightResult } from "./types.js";
import { welchTTest, passesMDE, effectiveSampleSize, benjaminiHochberg, formatCI, percentile } from "./stats.js";
import { query } from "../db.js";

export const WeatherTempSleepRule: InsightRule = {
  id: "weather_temp_sleep",
  type: "sleep",
  minDays: 30,
  tier: "semiweekly",
  version: 1,
  actionable: false,
  primaryMetric: "sleep_secs",

  async run(userId: string): Promise<InsightResult | null> {
    const rows = await query<{
      date: string;
      temp_min_c: string | null;
      sleep_secs: string | null;
      sleep_quality: string | null;
    }>(
      `SELECT
         wd.date::text,
         wd.temp_min_c::text,
         EXTRACT(EPOCH FROM (ss.end_time - ss.start_time))::text AS sleep_secs,
         ss.quality_score::text AS sleep_quality
       FROM weather_daily wd
       LEFT JOIN LATERAL (
         SELECT end_time, start_time, quality_score
         FROM sleep_sessions
         WHERE user_id = $1
           AND start_time::date = wd.date
         ORDER BY (end_time - start_time) DESC
         LIMIT 1
       ) ss ON TRUE
       WHERE wd.user_id = $1
         AND wd.date >= CURRENT_DATE - 90
         AND wd.temp_min_c IS NOT NULL`,
      [userId],
    );

    if (rows.length < 30) return null;

    const temps = rows
      .map((r) => Number(r.temp_min_c))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);

    if (temps.length < 30) return null;

    const p75 = percentile(temps, 0.75);

    const hot  = rows.filter((r) => Number(r.temp_min_c) >= p75);
    const cool = rows.filter((r) => Number(r.temp_min_c) < p75);
    if (hot.length < 8 || cool.length < 8) return null;

    const toSleep   = (r: typeof rows[0]) => Number(r.sleep_secs);
    const toQuality = (r: typeof rows[0]) => Number(r.sleep_quality);

    const hotSleep   = hot.filter((r)  => r.sleep_secs != null && Number.isFinite(toSleep(r))).map(toSleep);
    const coolSleep  = cool.filter((r) => r.sleep_secs != null && Number.isFinite(toSleep(r))).map(toSleep);
    const hotQual    = hot.filter((r)  => r.sleep_quality != null && Number.isFinite(toQuality(r))).map(toQuality);
    const coolQual   = cool.filter((r) => r.sleep_quality != null && Number.isFinite(toQuality(r))).map(toQuality);

    if (hotSleep.length < 8 || coolSleep.length < 8) return null;

    const effN  = effectiveSampleSize([...hotSleep, ...coolSleep]);
    const tSleep = welchTTest(coolSleep, hotSleep, effN);
    const sleepDiff = tSleep.meanA - tSleep.meanB; // cool - hot

    if (!passesMDE("sleep_secs", Math.abs(sleepDiff))) return null;

    const hasQual = hotQual.length >= 6 && coolQual.length >= 6;
    const tQual   = hasQual ? welchTTest(coolQual, hotQual) : null;
    const pValues = tQual ? [tSleep.pValue, tQual.pValue] : [tSleep.pValue];
    const [sleepPass] = benjaminiHochberg(pValues, 0.1);
    if (!sleepPass) return null;

    const dirWord = sleepDiff > 0 ? "shorter" : "longer";
    const diffMin = Math.round(Math.abs(sleepDiff) / 60);
    const ciStr   = tSleep.ci95
      ? ` ${formatCI([tSleep.ci95[0] / 60, tSleep.ci95[1] / 60], 0)} min`
      : "";

    const qualPasses = tQual && passesMDE("sleep_quality", Math.abs(tQual.meanA - tQual.meanB));

    let description =
      `On nights when the minimum temperature was above ${Math.round(p75)}°C (your top-quarter warm nights), ` +
      `your logged sleep was about ${diffMin} minutes ${dirWord} on average compared to cooler nights.${ciStr}`;

    if (qualPasses && tQual) {
      const qDir = tQual.meanA > tQual.meanB ? "higher" : "lower";
      description += ` Sleep quality was also ${qDir} on cooler nights (${tQual.meanA.toFixed(1)} vs ${tQual.meanB.toFixed(1)}/10).`;
    }

    return {
      title: `Sleep appears ${dirWord} on hot nights`,
      description,
      confidence: tSleep.pValue < 0.05 ? "high" : "moderate",
      confidenceScore: Math.round(
        Math.min(85, 30 + Math.abs(tSleep.effectSize) * 30 + Math.min(hotSleep.length, 25)),
      ),
      timesObserved: hotSleep.length + coolSleep.length,
      pValue: tSleep.pValue,
      effectSize: tSleep.effectSize,
      ci95: tSleep.ci95,
      supportingData: {
        hot_nights: hotSleep.length,
        cool_nights: coolSleep.length,
        temp_threshold_c: Math.round(p75),
        avg_sleep_hot_min: Math.round(tSleep.meanB / 60),
        avg_sleep_cool_min: Math.round(tSleep.meanA / 60),
        diff_min: diffMin,
        direction: dirWord,
        avg_quality_hot: tQual ? Number(tQual.meanB.toFixed(2)) : null,
        avg_quality_cool: tQual ? Number(tQual.meanA.toFixed(2)) : null,
        p_value: Number(tSleep.pValue.toFixed(3)),
      },
    };
  },
};
