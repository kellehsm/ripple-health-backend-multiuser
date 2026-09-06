import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Strip statements that reference the old VPS role (wellness_user) — not present on RDS
function stripLegacyGrants(sql) {
  return sql
    .split('\n')
    .filter(line => !line.match(/GRANT.*TO\s+wellness_user/i))
    .join('\n');
}

async function run() {
  const client = await pool.connect();
  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT now()
      )
    `);

    // Apply schema.sql (base tables) as migration "000_schema"
    const { rows: existing } = await client.query(
      "SELECT name FROM _migrations WHERE name = '000_schema'"
    );
    if (existing.length === 0) {
      console.log('Applying 000_schema.sql...');
      let schema = fs.readFileSync('/app/schema.sql', 'utf8');
      // Remove the index on medication_dose_logs — that table is created in migration 013
      schema = schema.replace(
        /CREATE INDEX IF NOT EXISTS idx_dose_logs_med_date[^;]+;/g, ''
      );
      await client.query(schema);
      await client.query("INSERT INTO _migrations (name) VALUES ('000_schema')");
      console.log('000_schema applied');
    } else {
      console.log('000_schema already applied');
    }

    // Apply numbered migrations
    const migrationsDir = '/app/migrations';
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT name FROM _migrations WHERE name = $1', [file]
      );
      if (rows.length === 0) {
        console.log(`Applying ${file}...`);
        let sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        sql = stripLegacyGrants(sql);
        try {
          await client.query(sql);
          await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
          console.log(`  ${file} done`);
        } catch(e) {
          console.error(`  ${file} FAILED:`, e.message);
          // Continue with other migrations — best effort
        }
      } else {
        console.log(`${file} already applied`);
      }
    }
    console.log('All migrations complete');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });
