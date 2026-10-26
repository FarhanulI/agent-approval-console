/**
 * Single transport entry point for API calls. Components never call `fetch`;
 * typed services do, through this function.
 *
 * The app's `/api/*` routes are answered by the server-side BFF (session
 * cookie, same origin). Mock data is produced on the server by the in-memory
 * backend when mock mode is on; there is no browser-side API interception, so
 * the authentication and authorization boundary is always exercised.
 * Credentials never go in `NEXT_PUBLIC_*` variables.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, { credentials: "same-origin", ...init });
}
