import { query } from "../db.js";
import { InsightRule, InsightResult } from "./types.js";

function detectPeriods(flowDays: string[]): Array<{ start: string; end: string }> {
  if (flowDays.length === 0) return [];
  const sorted = [...flowDays].sort();
  const periods: Array<{ start: string; end: string }> = [];
  let groupStart = sorted[0];
  let groupEnd = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(groupEnd).getTime();
    const curr = new Date(sorted[i]).getTime();
    if ((curr - prev) / 86400000 <= 2) {
      groupEnd = sorted[i];
    } else {
      periods.push({ start: groupStart, end: groupEnd });
      groupStart = sorted[i];
      groupEnd = sorted[i];
    }
  }
  periods.push({ start: groupStart, end: groupEnd });
  return periods;
}

export const ExerciseCycleCorrelationRule: InsightRule = {
  id: "exercise_cycle_correlation",
  type: "cycle",
  minDays: 90,

  async run(userId: string): Promise<InsightResult | null> {
    const flowRows = await query<{ log_date: string }>(
      `SELECT log_date::text FROM cycle_day_logs
       WHERE user_id = $1 AND flow_intensity != 'none' AND flow_intensity IS NOT NULL
       ORDER BY log_date ASC`,
      [userId]
    );
    const flowDays = flowRows.map((r) => r.log_date);
    const periods = detectPeriods(flowDays);

    // Need at least 3 complete cycles (4 period starts) to compare pre-period windows
    if (periods.length < 4) return null;

    const starts = periods.map((p) => p.start);

    // For each complete cycle (skip the current ongoing one), analyze pre-period window
    let prePeriodDays = 0;
    let prePeriodSessions = 0;
    let otherDays = 0;
    let otherSessions = 0;
    const cyclesAnalyzed: number[] = [];

    for (let i = 1; i < starts.length - 1; i++) {
      const cycleStart = new Date(starts[i - 1]);
      const nextStart = new Date(starts[i]);
      const cycleEnd = new Date(nextStart.getTime() - 86400000);

      // Pre-period window: 3 days before next period start
      const winStart = new Date(nextStart.getTime() - 3 * 86400000);

      // Count exercise sessions in pre-period window
      const [preRow] = await query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM exercise_sessions
         WHERE user_id = $1
           AND DATE(started_at AT TIME ZONE 'America/New_York') >= $2
           AND DATE(started_at AT TIME ZONE 'America/New_York') < $3`,
        [userId,
         winStart.toISOString().slice(0, 10),
         nextStart.toISOString().slice(0, 10)]
      );
      const [otherRow] = await query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM exercise_sessions
         WHERE user_id = $1
           AND DATE(started_at AT TIME ZONE 'America/New_York') >= $2
           AND DATE(started_at AT TIME ZONE 'America/New_York') < $3`,
        [userId,
         cycleStart.toISOString().slice(0, 10),
         winStart.toISOString().slice(0, 10)]
      );

      const cycleTotalDays = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / 86400000) + 1;
      const otherDaysInCycle = Math.max(1, cycleTotalDays - 3);

      prePeriodDays += 3;
      prePeriodSessions += parseInt(preRow?.cnt ?? "0");
      otherDays += otherDaysInCycle;
      otherSessions += parseInt(otherRow?.cnt ?? "0");
      cyclesAnalyzed.push(i);
    }

    if (prePeriodDays < 5 || cyclesAnalyzed.length < 3) return null;

    const preRate = prePeriodSessions / prePeriodDays;
    const otherRate = otherSessions / otherDays;

    if (otherRate === 0) return null;
    const diffPct = Math.round(((otherRate - preRate) / otherRate) * 100);

    if (Math.abs(diffPct) < 20) return null;

    const direction = diffPct > 0 ? "lower" : "higher";
    const absDiff = Math.abs(diffPct);
    const k = cyclesAnalyzed.length;

    return {
      title: `Workout completion tends to be ${direction} before your period`,
      description: `Your workout completion has been about ${absDiff}% ${direction} in the 3 days before your period, across your last ${k} cycles. This is a pattern — not a cause.`,
      confidence: "moderate",
      confidenceScore: 45,
      timesObserved: k,
      supportingData: {
        cycles_analyzed: k,
        pre_period_rate: preRate.toFixed(3),
        other_rate: otherRate.toFixed(3),
        difference_pct: diffPct,
        direction,
      },
    };
  },
};
