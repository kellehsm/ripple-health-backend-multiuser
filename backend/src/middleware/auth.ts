import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { redeemDownloadToken } from "../lib/downloadTokens.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

export const JWT_EXPIRY = "30d";

export function signToken(user_id: string): string {
  return jwt.sign({ user_id }, JWT_SECRET!, { expiresIn: JWT_EXPIRY });
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Primary: Authorization header. Fallback: ?token= query param (for URL-based downloads/PDFs).
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ")
    ? auth.slice(7)
    : (req.query as any)?.token as string | undefined;

  if (!token) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { user_id: string };
    req.user_id = payload.user_id;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}
