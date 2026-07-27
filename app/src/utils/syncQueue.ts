import * as SQLite from "expo-sqlite";
import { setNetworkOnline, setNetworkPending } from "./networkState";

const db = SQLite.openDatabaseSync("ripple_sync.db");

db.execSync(`
  CREATE TABLE IF NOT EXISTS sync_queue (
    id         TEXT    PRIMARY KEY,
    endpoint   TEXT    NOT NULL,
    method     TEXT    NOT NULL,
    payload    TEXT    NOT NULL,
    queued_at  INTEGER NOT NULL,
    attempts   INTEGER NOT NULL DEFAULT 0
  )
`);

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const BASE_URL = "https://app.kels.gg/api";

// Endpoints the batch sync route knows how to re-process.
const QUEUED_PREFIXES = ["/meals", "/journal", "/spending", "/metrics/", "/substances"];

export function isQueueableEndpoint(path: string): boolean {
  return QUEUED_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * Persist a failed write into the local SQLite queue.
 * Includes _sync_id in the payload so the batch endpoint can deduplicate.
 */
export function queueOfflineRequest(
  endpoint: string,
  method: string,
  payload: Record<string, unknown>
): void {
  const id = uuid();
  db.runSync(
    `INSERT OR IGNORE INTO sync_queue (id, endpoint, method, payload, queued_at, attempts)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [id, endpoint, method, JSON.stringify({ ...payload, _sync_id: id }), Date.now()]
  );
}

/**
 * Drain the queue by sending all pending items to POST /api/sync/batch.
 * The backend handles idempotency — duplicate submissions of the same _sync_id
 * are silently skipped.
 *
 * Returns { processed, remaining } so callers can show a pending-badge count.
 */
export async function processSyncQueue(): Promise<{ processed: number; remaining: number }> {
  const items = db.getAllSync<{
    id: string;
    endpoint: string;
    method: string;
    payload: string;
    attempts: number;
  }>(`SELECT * FROM sync_queue ORDER BY queued_at ASC LIMIT 50`);

  if (items.length === 0) return { processed: 0, remaining: 0 };

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/sync/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({
          sync_id: i.id,
          endpoint: i.endpoint,
          method: i.method,
          payload: JSON.parse(i.payload),
        })),
      }),
    });
  } catch {
    // Network down — leave queue intact
    return { processed: 0, remaining: items.length };
  }

  if (!res.ok) {
    for (const item of items) {
      db.runSync(`UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?`, [item.id]);
    }
    return { processed: 0, remaining: items.length };
  }

  setNetworkOnline(true);

  const results: Array<{ sync_id: string; status: string }> = await res.json();
  let processed = 0;

  for (const result of results) {
    if (
      result.status === "success" ||
      result.status === "already_processed" ||
      result.status === "discard"
    ) {
      db.runSync(`DELETE FROM sync_queue WHERE id = ?`, [result.sync_id]);
      processed++;
    } else {
      db.runSync(
        `UPDATE sync_queue SET attempts = attempts + 1 WHERE id = ?`,
        [result.sync_id]
      );
    }
  }

  const remaining =
    db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM sync_queue`)?.count ?? 0;
  setNetworkPending(remaining);
  return { processed, remaining };
}

export function getPendingQueueCount(): number {
  return (
    db.getFirstSync<{ count: number }>(`SELECT COUNT(*) as count FROM sync_queue`)?.count ?? 0
  );
}
