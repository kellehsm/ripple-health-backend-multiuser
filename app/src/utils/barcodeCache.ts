import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("ripple_sync.db");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

db.execSync(`
  CREATE TABLE IF NOT EXISTS barcode_cache (
    barcode    TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    cached_at  INTEGER NOT NULL
  )
`);

export function getCachedBarcode(barcode: string): Record<string, any> | null {
  const row = db.getFirstSync<{ result_json: string; cached_at: number }>(
    `SELECT result_json, cached_at FROM barcode_cache WHERE barcode = ?`,
    [barcode]
  );
  if (!row) return null;
  if (Date.now() - row.cached_at > CACHE_TTL_MS) {
    db.runSync(`DELETE FROM barcode_cache WHERE barcode = ?`, [barcode]);
    return null;
  }
  try {
    return JSON.parse(row.result_json);
  } catch {
    return null;
  }
}

export function setCachedBarcode(barcode: string, result: Record<string, any>): void {
  db.runSync(
    `INSERT OR REPLACE INTO barcode_cache (barcode, result_json, cached_at) VALUES (?, ?, ?)`,
    [barcode, JSON.stringify(result), Date.now()]
  );
}

export function invalidateBarcodeCache(barcode: string): void {
  db.runSync(`DELETE FROM barcode_cache WHERE barcode = ?`, [barcode]);
}

export function clearAllBarcodeCache(): void {
  db.runSync(`DELETE FROM barcode_cache`);
}
