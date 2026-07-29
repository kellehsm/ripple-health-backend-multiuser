import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

// All date/time functions (current_date, now(), CURRENT_TIMESTAMP) use EST.
pool.on("connect", (client) => {
  client.query("SET timezone = 'America/New_York'");
});

// Small helper so route files don't each import pg directly.
export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
