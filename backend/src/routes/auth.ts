import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { signToken } from "../middleware/auth.js";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

export default async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login — returns JWT on valid credentials
  app.post<{ Body: { email: string; password: string } }>("/login", async (req, reply) => {
    let { email, password } = req.body;
    if (!email || !password) {
      return reply.status(400).send({ error: "email and password required" });
    }

    // Dev shortcut: "demo" or the full demo email bypasses password check
    const emailLower = email.trim().toLowerCase();
    if (emailLower === "demo" || emailLower === "demo@ripple.test") {
      email = "demo@ripple.test";
      password = "demo123";
    }

    const rows = await query<{ id: string; password_hash: string | null }>(
      "SELECT id, password_hash FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );
    const user = rows[0];

    if (!user || !user.password_hash) {
      // Constant-time-ish: still do a hash check even on miss to avoid timing attacks
      await bcrypt.compare(password, "$2b$12$invalidhashfortimingprotection000000000000000000000000");
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const token = signToken(user.id);
    return { token, user_id: user.id };
  });

  // POST /api/auth/change-password — authenticated users can update their password
  app.post<{ Body: { current_password: string; new_password: string } }>(
    "/change-password",
    { preHandler: [(req, reply) => import("../middleware/auth.js").then(m => m.requireAuth(req, reply))] },
    async (req, reply) => {
      const { current_password, new_password } = req.body;
      if (!current_password || !new_password) {
        return reply.status(400).send({ error: "current_password and new_password required" });
      }
      if (new_password.length < 8) {
        return reply.status(400).send({ error: "Password must be at least 8 characters" });
      }

      const rows = await query<{ password_hash: string | null }>(
        "SELECT password_hash FROM users WHERE id = $1",
        [req.user_id]
      );
      const user = rows[0];
      if (!user?.password_hash || !(await bcrypt.compare(current_password, user.password_hash))) {
        return reply.status(401).send({ error: "Current password is incorrect" });
      }

      const hash = await bcrypt.hash(new_password, 12);
      await query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.user_id]);
      return { ok: true };
    }
  );

  // POST /api/auth/signup — public self-serve account creation
  app.post<{ Body: { email: string; password: string; name?: string } }>(
    "/signup",
    async (req, reply) => {
      const { email, password } = req.body;
      if (!email || !password) {
        return reply.status(400).send({ error: "email and password required" });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.status(400).send({ error: "Invalid email address." });
      }
      if (password.length < 8) {
        return reply.status(400).send({ error: "Password must be at least 8 characters." });
      }

      const hash = await bcrypt.hash(password, 12);
      try {
        const rows = await query<{ id: string }>(
          "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
          [email.toLowerCase().trim(), hash]
        );
        const user = rows[0];
        await query(
          "INSERT INTO user_settings (user_id, settings) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING",
          [user.id, JSON.stringify({})]
        );
        const token = signToken(user.id);
        return { token, user_id: user.id };
      } catch (err: any) {
        if (err?.code === "23505") {
          return reply.status(409).send({ error: "An account with this email already exists." });
        }
        throw err;
      }
    }
  );

  // POST /api/auth/create-user — admin-only, protected by ADMIN_SECRET header
  // Use this to onboard each person: curl -X POST .../api/auth/create-user \
  //   -H "x-admin-secret: <secret>" -d '{"email":"...","password":"..."}'
  app.post<{ Body: { email: string; password: string } }>(
    "/create-user",
    async (req, reply) => {
      if (!ADMIN_SECRET || req.headers["x-admin-secret"] !== ADMIN_SECRET) {
        return reply.status(403).send({ error: "Forbidden" });
      }
      const { email, password } = req.body;
      if (!email || !password) {
        return reply.status(400).send({ error: "email and password required" });
      }
      if (password.length < 8) {
        return reply.status(400).send({ error: "Password must be at least 8 characters" });
      }

      const hash = await bcrypt.hash(password, 12);
      try {
        const rows = await query<{ id: string; email: string }>(
          "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
          [email.toLowerCase().trim(), hash]
        );
        return rows[0];
      } catch (err: any) {
        if (err?.code === "23505") {
          return reply.status(409).send({ error: "Email already registered" });
        }
        throw err;
      }
    }
  );

  // POST /api/auth/me — validate token and return current user info
  app.post(
    "/me",
    { preHandler: [(req, reply) => import("../middleware/auth.js").then(m => m.requireAuth(req, reply))] },
    async (req) => {
      const rows = await query<{ id: string; email: string; onboarding_completed: boolean }>(
        "SELECT id, email, onboarding_completed FROM users WHERE id = $1",
        [req.user_id]
      );
      return rows[0] ?? null;
    }
  );

  // PATCH /api/auth/onboarding-complete — mark onboarding done on the account
  app.patch(
    "/onboarding-complete",
    { preHandler: [(req, reply) => import("../middleware/auth.js").then(m => m.requireAuth(req, reply))] },
    async (req) => {
      await query(
        "UPDATE users SET onboarding_completed = true WHERE id = $1",
        [req.user_id]
      );
      return { ok: true };
    }
  );
}
