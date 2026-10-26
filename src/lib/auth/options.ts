import { randomUUID } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import type { Provider } from "next-auth/providers/index";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { SESSION_MAX_AGE_SECONDS, getAuthSecret, shouldUseSecureCookies } from "./config";
import { isDevLoginAvailable, verifyDevCredentials } from "./dev-users";
import { ROLES } from "./policy";
import { safeCallbackPath } from "./redirect";

/** Shape our `authorize`/`profile` functions hand to the `jwt` callback. */
const signInUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  role: z.enum(ROLES),
  tenants: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * OIDC claims the console reads. ASSUMPTION (no IdP contract exists yet):
 * the provider issues `app_role` and `app_tenants`. They are validated here and
 * a profile without them fails sign-in rather than defaulting to any access.
 */
const oidcProfileSchema = z.object({
  sub: z.string().min(1),
  name: z.string().optional(),
  app_role: z.enum(ROLES),
  app_tenants: z.array(z.string().min(1)).min(1).max(100),
});

function buildProviders(): Provider[] {
  const providers: Provider[] = [];

  const issuer = process.env.AUTH_OIDC_ISSUER;
  const clientId = process.env.AUTH_OIDC_CLIENT_ID;
  const clientSecret = process.env.AUTH_OIDC_CLIENT_SECRET;
  if (issuer && clientId && clientSecret) {
    providers.push({
      id: "oidc",
      name: "Single sign-on",
      type: "oauth",
      wellKnown: `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
      idToken: true,
      checks: ["pkce", "state"],
      clientId,
      clientSecret,
      authorization: { params: { scope: "openid profile" } },
      profile(raw: unknown) {
        const claims = oidcProfileSchema.parse(raw);
        return {
          id: claims.sub,
          name: claims.name ?? null,
          role: claims.app_role,
          tenants: claims.app_tenants,
        };
      },
    });
  }

  if (isDevLoginAvailable()) {
    providers.push(
      CredentialsProvider({
        id: "credentials",
        name: "Development login",
        credentials: {
          username: { label: "Username", type: "text" },
          password: { label: "Password", type: "password" },
        },
        authorize(credentials) {
          const user = verifyDevCredentials(
            credentials?.username,
            credentials?.password,
          );
          return user
            ? { id: user.id, name: user.name, role: user.role, tenants: [...user.tenants] }
            : null;
        },
      }),
    );
  }

  return providers;
}

/**
 * Auth.js (next-auth v4) configuration.
 *
 * Session strategy: JWT (encrypted, in an HttpOnly cookie). There is no
 * database in this project, so database sessions are not an option. Trade-off:
 * a JWT session cannot be revoked server-side before `exp`, so the lifetime is
 * short and revocation must come from the identity provider or the backend.
 * Cookie: HttpOnly and SameSite=Lax (Auth.js defaults), `Secure` when the
 * public origin is https. Auth.js protects its own POST endpoints (sign-in,
 * sign-out) with a double-submit CSRF token. No token is stored in web storage.
 *
 * With no OIDC configuration and no dev provider the provider list is empty
 * and nobody can sign in (fail closed).
 */
export function createAuthOptions(): NextAuthOptions {
  return {
    providers: buildProviders(),
    secret: getAuthSecret(),
    useSecureCookies: shouldUseSecureCookies(),
    session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
    jwt: { maxAge: SESSION_MAX_AGE_SECONDS },
    pages: { signIn: "/login", error: "/login" },
    callbacks: {
      jwt({ token, user }) {
        if (!user) return token;
        // Sign-in: rebuild the token from validated claims only, dropping
        // email/picture and anything else the provider returned.
        const claims = signInUserSchema.parse(user);
        return {
          sub: claims.id,
          sid: randomUUID(),
          role: claims.role,
          tenants: claims.tenants,
          name: claims.name ?? undefined,
        };
      },
      redirect({ url, baseUrl }) {
        // Only same-origin relative destinations; prevents open redirects.
        try {
          const target = new URL(url, baseUrl);
          if (target.origin !== new URL(baseUrl).origin) {
            return `${baseUrl}${safeCallbackPath(null)}`;
          }
          return `${baseUrl}${safeCallbackPath(target.pathname + target.search)}`;
        } catch {
          return `${baseUrl}${safeCallbackPath(null)}`;
        }
      },
    },
  };
}
