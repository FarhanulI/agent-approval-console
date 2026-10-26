import { encode } from "next-auth/jwt";

/** Test-only secret; never a real credential. */
export const TEST_AUTH_SECRET = "unit-test-secret-unit-test-secret-0123456789";

export type TestClaims = {
  sub: string;
  sid?: string;
  role: string;
  tenants: string[];
};

export const REVIEWER_BOTH: TestClaims = {
  sub: "usr_test_reviewer",
  role: "reviewer",
  tenants: ["tenant_main", "tenant_east"],
};
export const REVIEWER_MAIN: TestClaims = {
  sub: "usr_test_main",
  role: "reviewer",
  tenants: ["tenant_main"],
};
export const VIEWER_BOTH: TestClaims = {
  sub: "usr_test_viewer",
  role: "viewer",
  tenants: ["tenant_main", "tenant_east"],
};

/** Mints a real encrypted Auth.js session cookie header value. */
export async function sessionCookie(
  claims: TestClaims,
  options: { secret?: string; maxAge?: number } = {},
): Promise<string> {
  const token = await encode({
    token: { ...claims, sid: claims.sid ?? "sid_test" },
    secret: options.secret ?? TEST_AUTH_SECRET,
    maxAge: options.maxAge ?? 3600,
  });
  return `next-auth.session-token=${token}`;
}

export function setTestEnv(vi: { stubEnv(name: string, value: string): unknown }) {
  vi.stubEnv("AUTH_SECRET", TEST_AUTH_SECRET);
  vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");
  vi.stubEnv("ALLOW_MOCK_BACKEND_IN_PRODUCTION", "");
}
