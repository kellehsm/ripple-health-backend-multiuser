import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

// Timezone is set via connection options (not a post-connect SET) so it's
// applied by the server before the client is ever handed out — avoids a race
// with the first user query and the "client.query() while already executing"
// pg deprecation warning that the post-connect handler triggered.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=America/New_York",
  max: 20,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
});

// Small helper so route files don't each import pg directly.
export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
