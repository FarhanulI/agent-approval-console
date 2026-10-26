const FALLBACK = "/approvals";

/**
 * Returns a same-origin relative path that is safe to redirect to, or the
 * fallback. Rejects absolute URLs, protocol-relative (`//host`), backslash
 * tricks, control characters and the login/auth routes themselves (prevents
 * open redirects and redirect loops).
 */
export function safeCallbackPath(candidate: string | null | undefined): string {
  if (!candidate || candidate.length > 2048) return FALLBACK;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return FALLBACK;
  if (/[\\\u0000-\u001f\u007f]/.test(candidate)) return FALLBACK;
  if (/^\/(login|api\/auth)(\/|\?|#|$)/.test(candidate)) return FALLBACK;
  return candidate;
}
