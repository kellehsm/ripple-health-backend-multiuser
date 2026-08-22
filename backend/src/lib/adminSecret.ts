import { timingSafeEqual } from "crypto";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

/** Constant-time admin-secret compare — plain !== leaks the shared secret via
 *  a remote timing oracle on admin/auth endpoints. */
export function adminSecretMatches(supplied: string | undefined): boolean {
  if (!ADMIN_SECRET || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(ADMIN_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
