import { describe, expect, it } from "vitest";
import { authorize, canAccessTenant, roleHasPermission } from "./policy";
import { safeCallbackPath } from "./redirect";

describe("AUTHZ-001 policy", () => {
  it("grants decisions only to reviewers", () => {
    expect(roleHasPermission("reviewer", "action:approve")).toBe(true);
    expect(roleHasPermission("reviewer", "action:reject")).toBe(true);
    expect(roleHasPermission("viewer", "action:approve")).toBe(false);
    expect(roleHasPermission("viewer", "action:reject")).toBe(false);
    expect(roleHasPermission("viewer", "action:view")).toBe(true);
    expect(roleHasPermission("viewer", "run:view")).toBe(true);
    expect(roleHasPermission("viewer", "audit:view")).toBe(true);
  });

  it("requires tenant membership and fails closed without a tenant (TENANT-001)", () => {
    const subject = { role: "reviewer", tenantIds: ["t1"] } as const;
    expect(authorize(subject, "action:approve", { tenantId: "t1" })).toEqual({ allowed: true });
    expect(authorize(subject, "action:approve", { tenantId: "t2" })).toEqual({ allowed: false, reason: "tenant" });
    expect(authorize(subject, "action:approve", { tenantId: undefined })).toEqual({ allowed: false, reason: "tenant" });
    expect(canAccessTenant({ tenantIds: [] }, "t1")).toBe(false);
  });

  it("reports permission before tenant", () => {
    expect(authorize({ role: "viewer", tenantIds: ["t1"] }, "action:approve", { tenantId: "t2" })).toEqual({
      allowed: false,
      reason: "permission",
    });
  });
});

describe("AUTH-001 safeCallbackPath (open-redirect and loop prevention)", () => {
  it("keeps safe relative paths", () => {
    expect(safeCallbackPath("/approvals/act_0001?x=1")).toBe("/approvals/act_0001?x=1");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "approvals",
    "/ok\r\nSet-Cookie: a=b",
    "/login",
    "/login?callbackUrl=/x",
    "/api/auth/signin",
    "",
    undefined,
    null,
  ])("falls back for %s", (value) => {
    expect(safeCallbackPath(value as string | null | undefined)).toBe("/approvals");
  });
});
