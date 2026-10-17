/**
 * Single transport entry point for API calls. Components never call `fetch`;
 * typed services do, through this function.
 *
 * When `NEXT_PUBLIC_API_MOCKING=enabled`, the MSW worker is started (once)
 * before the first request. The flag is not a secret; never put credentials in
 * `NEXT_PUBLIC_*` variables.
 */
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
    typeof window !== "undefined"
  ) {
    const { enableMocking } = await import("@/mocks/browser");
    await enableMocking();
  }
  return fetch(input, init);
}
