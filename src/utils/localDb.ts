// Web builds resolve localDb.web.ts instead (no-op stub) — keeping expo-sqlite
// out of the web bundle entirely, since it needs SharedArrayBuffer there.
import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("ripple_sync.db");
