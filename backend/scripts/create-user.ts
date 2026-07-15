#!/usr/bin/env npx tsx
/**
 * Create a user account in the wellness_multiuser database.
 * Usage: npx tsx scripts/create-user.ts <email> <password>
 */
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";

dotenv.config();

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: npx tsx scripts/create-user.ts <email> <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
    [email.toLowerCase().trim(), hash]
  );
  console.log("Created user:", rows[0]);
} catch (err: any) {
  if (err?.code === "23505") console.error("Error: email already exists");
  else console.error("Error:", err?.message);
  process.exit(1);
} finally {
  await pool.end();
}
