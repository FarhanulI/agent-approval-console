import { createHash, timingSafeEqual } from "node:crypto";
import { isMockModeEnabled } from "@/lib/config/mock-mode";
import type { Role } from "./policy";

/**
 * Fixture users for the DEV/TEST-ONLY credentials provider. This is not
 * production authentication: it exists so the boundary (sessions, roles,
 * tenants) can be exercised end to end without an identity provider.
 * The shared password comes from `AUTH_DEV_PASSWORD`; there is no default.
 */
export type DevUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
  tenants: readonly string[];
};

export const DEV_USERS: readonly DevUser[] = [
  {
    id: "usr_dev_reviewer",
    username: "reviewer",
    name: "Dev Reviewer",
    role: "reviewer",
    tenants: ["tenant_main", "tenant_east"],
  },
  {
    id: "usr_dev_viewer",
    username: "viewer",
    name: "Dev Viewer",
    role: "viewer",
    tenants: ["tenant_main", "tenant_east"],
  },
  {
    id: "usr_dev_main_reviewer",
    username: "main-reviewer",
    name: "Dev Main-tenant Reviewer",
    role: "reviewer",
    tenants: ["tenant_main"],
  },
];

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Verifies dev credentials. Returns null unless mock mode is on, a password is
 * configured, and both username and password match (constant-time compare).
 */
export function verifyDevCredentials(
  username: unknown,
  password: unknown,
): DevUser | null {
  const expected = process.env.AUTH_DEV_PASSWORD;
  if (!isMockModeEnabled() || !expected) return null;
  if (typeof username !== "string" || typeof password !== "string") return null;
  const passwordOk = timingSafeEqual(digest(password), digest(expected));
  const user = DEV_USERS.find((candidate) => candidate.username === username);
  return passwordOk && user ? user : null;
}

/** Whether the dev provider is registered (shown on the login page). */
export function isDevLoginAvailable(): boolean {
  return isMockModeEnabled() && Boolean(process.env.AUTH_DEV_PASSWORD);
}
