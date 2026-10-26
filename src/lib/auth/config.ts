import { env } from "@/lib/config/env";

/**
 * Session signing/encryption secret. Server-side only (never `NEXT_PUBLIC_*`).
 * Returns undefined when missing or too short, and every caller treats that as
 * "cannot establish identity" (fail closed) instead of using a default.
 */
export function getAuthSecret(): string | undefined {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}

/** Session lifetime. Short, because JWT sessions cannot be revoked server-side. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/**
 * Cookie `Secure` flag, derived from the configured public origin so that
 * Auth.js (`useSecureCookies`) and `getToken` agree on the cookie name.
 */
export function shouldUseSecureCookies(): boolean {
  return env.APP_URL.startsWith("https://");
}
