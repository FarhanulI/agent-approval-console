import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { ROLES, type Role } from "./policy";
import { getAuthSecret, shouldUseSecureCookies } from "./config";

/**
 * Trusted server-side identity. Three distinct things are deliberately kept
 * apart and must not be treated as interchangeable:
 * - the Auth.js session (an encrypted JWT cookie that proves a login happened);
 * - the application user (`userId`, the stable `sub` set at sign-in);
 * - tenant membership and role (`tenantIds`, `role`), which come from the
 *   identity provider claims validated by `sessionClaimsSchema`.
 * The real backend has its own identity/authorization that this console cannot
 * observe; the BFF forwards `userId` as the actor, and the backend must
 * authorize independently.
 */
export type Principal = {
  userId: string;
  /** Per-login id (`sid` claim); useful for correlation, not a secret. */
  sessionId: string;
  role: Role;
  tenantIds: readonly string[];
  /** Expiry as Unix seconds, from the JWT `exp` claim. */
  expiresAt: number | null;
};

export type AuthResult =
  | { authenticated: true; principal: Principal }
  | { authenticated: false; reason: "no-session" };

/** Claims written into the session JWT at sign-in (server-side only). */
export const sessionClaimsSchema = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
  role: z.enum(ROLES),
  tenants: z.array(z.string().min(1)).min(1).max(100),
  exp: z.number().optional(),
});

/** Validates decoded JWT claims; anything unexpected yields null (fail closed). */
export function principalFromClaims(raw: unknown): Principal | null {
  const parsed = sessionClaimsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { sub, sid, role, tenants, exp } = parsed.data;
  return {
    userId: sub,
    sessionId: sid,
    role,
    tenantIds: tenants,
    expiresAt: exp ?? null,
  };
}

type TokenSource = { headers: Headers };

/** Parses a `Cookie` header into a name→value record (values stay encoded). */
function parseCookieHeader(header: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    if (!(name in cookies)) cookies[name] = part.slice(index + 1).trim();
  }
  return cookies;
}

/**
 * Resolves the principal from the session cookie of a request. Missing secret,
 * missing/invalid/expired/tampered cookie, or malformed claims all return
 * `no-session`; nothing is read from the body, query string or other headers.
 * Only the cookie is passed to Auth.js, so an `Authorization: Bearer` header
 * cannot be used as an alternative way to present a session.
 */
export async function resolvePrincipal(req: TokenSource): Promise<AuthResult> {
  const secret = getAuthSecret();
  if (!secret) return { authenticated: false, reason: "no-session" };
  try {
    const token = await getToken({
      req: {
        cookies: parseCookieHeader(req.headers.get("cookie")),
        headers: new Headers(),
      } as unknown as Parameters<typeof getToken>[0]["req"],
      secret,
      secureCookie: shouldUseSecureCookies(),
    });
    const principal = token ? principalFromClaims(token) : null;
    return principal
      ? { authenticated: true, principal }
      : { authenticated: false, reason: "no-session" };
  } catch {
    return { authenticated: false, reason: "no-session" };
  }
}
