/**
 * Server-side gate for everything that stands in for a real backend or real
 * authentication: the in-memory backend, the dev credentials provider and the
 * mock-control route.
 *
 * Mock mode requires the (non-secret) build flag `NEXT_PUBLIC_API_MOCKING=enabled`.
 * In a production build it additionally requires an explicit server-side
 * acknowledgement, so a stray public flag can never silently turn a real
 * deployment into a mock one. Only the Playwright production-build run sets it.
 * There is no automatic fallback from a failing real backend to mock mode.
 */
export function isMockModeEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_MOCK_BACKEND_IN_PRODUCTION === "true";
}
