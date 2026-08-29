import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { redeemDownloadToken } from "../lib/downloadTokens.js";
import { query } from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

// In-process cache for token_version — avoids a DB hit on every authenticated
// request. TTL is short (30s) so revocations propagate quickly.
const TOKEN_VERSION_CACHE_TTL_MS = 30_000;
interface TokenVersionEntry { version: number; expiresAt: number }
const tokenVersionCache = new Map<string, TokenVersionEntry>();

/** Evict a user from the cache immediately (call after bumping token_version). */
export function invalidateTokenVersionCache(userId: string): void {
  tokenVersionCache.delete(userId);
}

export const JWT_EXPIRY = "30d";

export function signToken(user_id: string, token_version: number = 0): string {
  return jwt.sign({ user_id, tv: token_version }, JWT_SECRET!, { expiresIn: JWT_EXPIRY });
}

// Widget tokens live in a plain file readable by the Android home-screen widget
// (SecureStore is not accessible from the widget process), so they carry a
// "widget" scope that restricts them to the handful of endpoints the widget uses.
export function signWidgetToken(user_id: string): string {
  return jwt.sign({ user_id, scope: "widget" }, JWT_SECRET!, { expiresIn: "7d" });
}

const WIDGET_GET_PREFIXES = [
  "/api/glucose/status",
  "/api/health-connect/steps",
  "/api/heart-rate",
  "/api/health-connect/sleep/stats",
  "/api/metrics",
  "/api/insights",
  "/api/mindfulness/stats",
];

function isWidgetAllowed(method: string, url: string): boolean {
  const path = url.split("?")[0];
  if (method === "GET") {
    return WIDGET_GET_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
  }
  if (method === "POST") {
    // Widget water logging: create water metric + append a log entry
    // Watch mood logging: journal entry (moment) from the Wear Log activity
    return (
      path === "/api/metrics" ||
      /^\/api\/metrics\/[^/]+\/logs$/.test(path) ||
      path === "/api/journal"
    );
  }
  return false;
}

/**
 * Rate-limit bucket key: verified JWT user_id when the request carries a valid
 * bearer token, otherwise the client IP. Verifying (not just echoing) the
 * header prevents attackers from minting unlimited buckets via garbage
 * Authorization values.
 */
export function rateLimitKey(req: FastifyRequest): string {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET!, { algorithms: ['HS256'] }) as { user_id?: string };
      if (payload.user_id) return `u:${payload.user_id}`;
    } catch {
      // invalid token — fall through to IP keying
    }
  }
  return req.ip;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  // URL-based downloads use a short-lived single-use ?dl= token minted via
  // /api/auth/download-token. This keeps the long-lived JWT out of logs,
  // browser history, and referer headers.
  const dl = (req.query as any)?.dl as string | undefined;
  if (dl) {
    const user_id = redeemDownloadToken(dl);
    if (!user_id) return reply.status(401).send({ error: "Invalid or expired download token" });
    req.user_id = user_id;
    return;
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET!, { algorithms: ['HS256'] }) as { user_id: string; scope?: string; tv?: number };
    if (payload.scope === "widget" && !isWidgetAllowed(req.method, req.url)) {
      return reply.status(403).send({ error: "Widget token not permitted for this endpoint" });
    }
    // Token revocation check: compare payload tv against DB token_version.
    // Cache the DB value for 30s to avoid a query on every request.
    // Missing tv is treated as 0 so old tokens survive until the column is non-zero.
    const now = Date.now();
    let cachedEntry = tokenVersionCache.get(payload.user_id);
    if (!cachedEntry || cachedEntry.expiresAt <= now) {
      const tvRows = await query<{ token_version: number }>(
        "SELECT token_version FROM users WHERE id = $1",
        [payload.user_id]
      );
      if (!tvRows[0]) {
        return reply.status(401).send({ error: "Token has been revoked" });
      }
      cachedEntry = { version: tvRows[0].token_version, expiresAt: now + TOKEN_VERSION_CACHE_TTL_MS };
      tokenVersionCache.set(payload.user_id, cachedEntry);
    }
    if ((payload.tv ?? 0) !== cachedEntry.version) {
      return reply.status(401).send({ error: "Token has been revoked" });
    }
    req.user_id = payload.user_id;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}
