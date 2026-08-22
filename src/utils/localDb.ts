import { Platform } from "react-native";

type LocalDb = {
  execSync: (sql: string) => void;
  runSync: (sql: string, params?: unknown[]) => void;
  getFirstSync: <T>(sql: string, params?: unknown[]) => T | null;
  getAllSync: <T>(sql: string, params?: unknown[]) => T[];
};

// expo-sqlite on web needs SharedArrayBuffer (HTTPS-only); the offline queue
// and barcode cache aren't needed in the browser, so web gets a no-op db.
export const db: LocalDb =
  Platform.OS === "web"
    ? {
        execSync: () => {},
        runSync: () => {},
        getFirstSync: () => null,
        getAllSync: () => [],
      }
    : (require("expo-sqlite").openDatabaseSync("ripple_sync.db") as LocalDb);
