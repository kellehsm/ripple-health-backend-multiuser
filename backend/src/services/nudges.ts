/**
 * Micro-nudges — at most one push nudge per user per day, drawn from their
 * highest-ranked actionable insight. Cooldown is per-rule (14 days) to
 * avoid pestering.
 */

import { query } from "../db.js";
import { listSupportedRules } from "./insightExperimentTemplates.js";

const NUDGE_COOLDOWN_DAYS = 14;
const ACTIONABLE_RULES = new Set(listSupportedRules());

export interface NudgeCandidate {
  user_id: string;
  insight_id: string;
  rule_id: string;
  title: string;
  description: string;
}

export async function pickNudgeForUser(userId: string): Promise<NudgeCandidate | null> {
  // Cooldown gate: has the user already been nudged today?
  const [recent] = await query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM insight_nudges
     WHERE user_id = $1 AND sent_at >= NOW() - INTERVAL '1 day'`,
    [userId]
  );
  if (Number(recent?.c ?? 0) > 0) return null;

  const rows = await query<{ id: string; rule_id: string; title: string; description: string }>(
    `SELECT ui.id, ui.rule_id, ui.title, ui.description
     FROM user_insights ui
     LEFT JOIN LATERAL (
       SELECT MAX(sent_at) AS last_sent FROM insight_nudges
       WHERE user_id = ui.user_id AND rule_id = ui.rule_id
     ) n ON TRUE
     WHERE ui.user_id = $1
       AND ui.status = 'active' AND ui.dismissed = FALSE
       AND NOT (ui.supporting_data ? 'duplicate_of')
       AND (n.last_sent IS NULL OR n.last_sent < NOW() - ($2 || ' days')::interval)
     ORDER BY COALESCE(ui.rank_score, ui.confidence_score / 100.0) DESC
     LIMIT 5`,
    [userId, String(NUDGE_COOLDOWN_DAYS)]
  );

  const actionable = rows.find(r => ACTIONABLE_RULES.has(r.rule_id));
  const pick = actionable ?? rows[0];
  if (!pick) return null;
  return {
    user_id: userId,
    insight_id: pick.id,
    rule_id: pick.rule_id,
    title: pick.title,
    description: pick.description,
  };
}

export async function recordNudgeSent(cand: NudgeCandidate): Promise<void> {
  await query(
    `INSERT INTO insight_nudges (user_id, rule_id) VALUES ($1, $2)`,
    [cand.user_id, cand.rule_id]
  );
}
