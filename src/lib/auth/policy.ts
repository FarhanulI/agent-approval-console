/**
 * Authorization policy. Pure and framework-free so it can be unit-tested and
 * reused by the BFF and by UI hints.
 *
 * Roles are deliberately minimal (no hierarchy): `viewer` reads, `reviewer`
 * reads and decides. Roles and tenant memberships must come from an
 * authoritative source (the identity provider claims validated in
 * `principal.ts`); never from the browser.
 *
 * This is the BFF's policy. It does not replace authorization in the real
 * backend, which is mandatory and not verified for `erp-mcp-bridge`.
 */

export const ROLES = ["viewer", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "action:view"
  | "action:approve"
  | "action:reject"
  | "run:view"
  | "audit:view";

const GRANTS: Record<Role, readonly Permission[]> = {
  viewer: ["action:view", "run:view", "audit:view"],
  reviewer: [
    "action:view",
    "action:approve",
    "action:reject",
    "run:view",
    "audit:view",
  ],
};

/** The identity facts the policy needs; a subset of the server `Principal`. */
export type PolicySubject = {
  role: Role;
  tenantIds: readonly string[];
};

export type AuthorizationResult =
  | { allowed: true }
  | { allowed: false; reason: "permission" | "tenant" };

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

/** Fail closed: a resource without a tenant is never accessible. */
export function canAccessTenant(
  subject: Pick<PolicySubject, "tenantIds">,
  tenantId: string | undefined,
): boolean {
  return tenantId !== undefined && subject.tenantIds.includes(tenantId);
}

/**
 * Checks a permission and, when a resource is supplied, tenant membership.
 * Pass `resource` for any operation on a specific record.
 */
export function authorize(
  subject: PolicySubject,
  permission: Permission,
  resource?: { tenantId: string | undefined },
): AuthorizationResult {
  if (!roleHasPermission(subject.role, permission)) {
    return { allowed: false, reason: "permission" };
  }
  if (resource && !canAccessTenant(subject, resource.tenantId)) {
    return { allowed: false, reason: "tenant" };
  }
  return { allowed: true };
}
