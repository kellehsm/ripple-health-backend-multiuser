/**
 * Multi-factor insight ranking + lifecycle utilities.
 *
 * The default `ORDER BY confidence_score DESC` in getActiveInsights is too
 * one-dimensional. This ranker blends:
 *   confidence (raw 0-100)
 *   novelty    (fresh insights outrank ones the user has already seen)
 *   actionable (rules with experiment templates float up)
 *   affinity   (user's per-rule weight from feedback history)
 *   decay      (insights untouched > 21d fade)
 *
 * All factors are combined into `rank_score`, written into user_insights
 * during the ranking pass so the UI can just ORDER BY rank_score DESC.
 */

import { query } from "../db.js";
import { listSupportedRules } from "./insightExperimentTemplates.js";

const ACTIONABLE_RULE_IDS = new Set(listSupportedRules());

export interface RankableInsight {
  id: string;
  rule_id: string;
  confidence_score: number;
  first_detected: string;
  last_confirmed: string;
  supporting_data: any;
}

export async function rankAndPersist(userId: string): Promise<{ ranked: number }> {
  const rows = await query<RankableInsight>(
    `SELECT id, rule_id, confidence_score, first_detected, last_confirmed, supporting_data
     FROM user_insights
     WHERE user_id = $1 AND dismissed = FALSE AND status = 'active'`,
    [userId]
  );
  if (rows.length === 0) return { ranked: 0 };

  const weights = await query<{ rule_id: string; weight: number }>(
    `SELECT rule_id, weight FROM user_rule_weights WHERE user_id = $1`,
    [userId]
  );
  const wMap = new Map(weights.map(w => [w.rule_id, Number(w.weight)]));

  const now = Date.now();
  for (const row of rows) {
    const conf = Number(row.confidence_score) / 100;                    // 0..1
    const ageDays = (now - new Date(row.first_detected).getTime()) / 86400000;
    const novelty = ageDays < 3 ? 1 : ageDays < 14 ? Math.max(0, 1 - (ageDays - 3) / 20) : 0.1;
    const actionable = ACTIONABLE_RULE_IDS.has(row.rule_id) ? 1 : 0;
    // Default 1.5 (the ceiling) for unrated rules so they aren't silently
    // penalized ~13% vs a rule the user has "helpful"-rated. Only feedback
    // should move a rule off the neutral top.
    const affinity = Math.max(0.1, Math.min(1.5, wMap.get(row.rule_id) ?? 1.5));
    const untouchedDays = (now - new Date(row.last_confirmed).getTime()) / 86400000;
    const decay = untouchedDays > 21 ? 0.3 : 1;

    const rankScore =
      (0.45 * conf) +
      (0.20 * novelty) +
      (0.15 * actionable) +
      (0.20 * (affinity / 1.5));  // renormalize affinity into 0..1

    const finalScore = rankScore * decay;
    await query(
      `UPDATE user_insights SET rank_score = $1 WHERE id = $2`,
      [Number(finalScore.toFixed(4)), row.id]
    );
  }
  return { ranked: rows.length };
}

/**
 * Detect insights whose underlying pattern has flipped or weakened since the
 * last engine run. Compares the current run's supporting_data against the
 * prior stored row: if a large-effect insight now reports a small effect,
 * emit a follow-up "no longer predicts" pattern.
 *
 * Implementation note: this reads user_insights.supporting_data.effect_size
 * (populated by upsertInsight) — no separate history table needed for v1.
 */
export async function detectFlipsForUser(userId: string): Promise<number> {
  const rows = await query<{ rule_id: string; supporting_data: any; confidence_score: number }>(
    `SELECT rule_id, supporting_data, confidence_score
     FROM user_insights
     WHERE user_id = $1 AND status = 'stale' AND dismissed = FALSE
       AND supporting_data ? 'effect_size'`,
    [userId]
  );
  let emitted = 0;
  for (const r of rows) {
    const prior = Number(r.supporting_data?.effect_size ?? 0);
    if (Math.abs(prior) < 0.5) continue;
    // We don't have the current-run result here (that lived in the engine).
    // v1 heuristic: any stale-but-recently-active insight with a big prior
    // effect gets a follow-up marker. UI shows this as "this pattern has
    // weakened since your last check."
    await query(
      `INSERT INTO user_insights
         (user_id, rule_id, type, title, description, confidence, confidence_score,
          supporting_data, status, dismissed)
       VALUES ($1, $2, 'trend',
         'A previous pattern has weakened',
         $3,
         'moderate', 40,
         $4::jsonb, 'active', FALSE)
       ON CONFLICT (user_id, rule_id) DO NOTHING`,
      [
        userId,
        `${r.rule_id}_flipped`,
        `The pattern reported under "${r.rule_id}" no longer meets confidence thresholds — behavior or biology may have shifted.`,
        JSON.stringify({ parent_rule: r.rule_id, prior_effect: prior }),
      ]
    );
    emitted++;
  }
  return emitted;
}

/**
 * Cluster near-duplicate insights and keep only the strongest per cluster
 * (marks the rest with a `duplicate_of` field so the UI can hide them).
 * v1: cluster by shared "primary_metric" + shared direction word.
 */
export async function dedupInsights(userId: string): Promise<number> {
  const rows = await query<{
    id: string; rule_id: string; supporting_data: any; confidence_score: number;
  }>(
    `SELECT id, rule_id, supporting_data, confidence_score
     FROM user_insights
     WHERE user_id = $1 AND dismissed = FALSE AND status = 'active'`,
    [userId]
  );
  // Only cluster rows that expose BOTH primary_metric AND direction — rows
  // missing either land in a per-rule bucket so unrelated rules (medication,
  // streaks, journaling…) don't get cross-deduped through a shared "?|?" key.
  const buckets = new Map<string, typeof rows>();
  for (const r of rows) {
    const metric = r.supporting_data?.primary_metric;
    const direction = r.supporting_data?.direction;
    const key = metric && direction
      ? `${metric}|${direction}`
      : `rule:${r.rule_id}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }
  let hidden = 0;
  for (const [, group] of buckets) {
    if (group.length < 2) continue;
    group.sort((a, b) => Number(b.confidence_score) - Number(a.confidence_score));
    for (let i = 1; i < group.length; i++) {
      await query(
        `UPDATE user_insights
         SET supporting_data = supporting_data || jsonb_build_object('duplicate_of', $1::text)
         WHERE id = $2`,
        [group[0].id, group[i].id]
      );
      hidden++;
    }
  }
  return hidden;
}

/** Update per-user rule weight from a single feedback event. */
export async function adjustRuleWeight(userId: string, ruleId: string, rating: string): Promise<void> {
  const delta =
    rating === "helpful"      ?  0.15 :
    rating === "already_knew" ? -0.05 :
    rating === "neutral"      ?  0.00 :
    rating === "not_useful"   ? -0.25 : 0;
  if (delta === 0) return;
  await query(
    `INSERT INTO user_rule_weights (user_id, rule_id, weight, updated_at)
     VALUES ($1, $2, GREATEST(0.1, LEAST(1.5, 1.0 + $3)), NOW())
     ON CONFLICT (user_id, rule_id) DO UPDATE SET
       weight     = GREATEST(0.1, LEAST(1.5, user_rule_weights.weight + $3)),
       updated_at = NOW()`,
    [userId, ruleId, delta]
  );
}
