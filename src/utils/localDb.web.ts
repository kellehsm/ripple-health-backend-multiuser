// Web build: expo-sqlite needs SharedArrayBuffer (HTTPS-only) and the offline
// queue / barcode cache are native-only concerns, so web gets a no-op db.
export const db = {
  execSync: (_sql: string) => {},
  runSync: (_sql: string, _params?: unknown[]) => {},
  getFirstSync: <T,>(_sql: string, _params?: unknown[]): T | null => null,
  getAllSync: <T,>(_sql: string, _params?: unknown[]): T[] => [],
};
