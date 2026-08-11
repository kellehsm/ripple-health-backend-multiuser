import { FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { redeemDownloadToken } from "../lib/downloadTokens.js";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error("JWT_SECRET env var is required");

export const JWT_EXPIRY = "30d";

export function signToken(user_id: string): string {
  return jwt.sign({ user_id }, JWT_SECRET!, { expiresIn: JWT_EXPIRY });
}

// Widget tokens live in a plain file readable by the Android home-screen widget
// (SecureStore is not accessible from the widget process), so they carry a
// "widget" scope that restricts them to the handful of endpoints the widget uses.
export function signWidgetToken(user_id: string): string {
  return jwt.sign({ user_id, scope: "widget" }, JWT_SECRET!, { expiresIn: JWT_EXPIRY });
}

const WIDGET_GET_PREFIXES = [
  "/api/glucose/status",
  "/api/health-connect/steps",
  "/api/heart-rate",
  "/api/sleep/stats",
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
    return path === "/api/metrics" || /^\/api\/metrics\/[^/]+\/logs$/.test(path);
  }
  return false;
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
    const payload = jwt.verify(token, JWT_SECRET!) as { user_id: string; scope?: string };
    if (payload.scope === "widget" && !isWidgetAllowed(req.method, req.url)) {
      return reply.status(403).send({ error: "Widget token not permitted for this endpoint" });
    }
    req.user_id = payload.user_id;
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }
}
