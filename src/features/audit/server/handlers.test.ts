import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listMockActions, resetMockActionState } from "@/mocks/action-store";
import { getRecordedMockAuditEvents, resetMockAuditState } from "@/mocks/audit-store";
import { resetAllScenarios, setAuditScenario, setDecisionScenario } from "@/mocks/scenarios";
import {
  REVIEWER_BOTH,
  REVIEWER_MAIN,
  VIEWER_BOTH,
  sessionCookie,
  setTestEnv,
  type TestClaims,
} from "@/test/auth-helpers";
import { handleDecision } from "@/features/approvals/server/handlers";
import { handleGetAuditEvent, handleListAuditEvents } from "./handlers";

const ORIGIN = "http://localhost:3000";
const KEY = "idem-key-0123456789abcdef";

const pendingIn = (tenant: string) =>
  listMockActions().find((a) => a.status === "pending" && a.targetRecord.tenantId === tenant)!;

async function get(path: string, claims: TestClaims | null = REVIEWER_BOTH) {
  const headers: Record<string, string> = {};
  if (claims) headers.cookie = await sessionCookie(claims);
  return new Request(`${ORIGIN}${path}`, { headers });
}

async function decide(
  actionId: string,
  claims: TestClaims | null,
  body: unknown,
  key = KEY,
) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "content-type": "application/json",
    "idempotency-key": key,
  };
  if (claims) headers.cookie = await sessionCookie(claims);
  const request = new Request(`${ORIGIN}/api/actions/${actionId}/approve`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return handleDecision(request, actionId, "approve");
}

type Body = {
  items: { id: string; actionId?: string; outcome: string; eventType: string; occurredAt: string }[];
  pagination: { page: number; pageSize: number; total: number };
  error: { code: string };
};

async function list(query = "", claims: TestClaims | null = REVIEWER_BOTH) {
  const response = await handleListAuditEvents(await get(`/api/audit-events${query}`, claims));
  return { response, body: (await response.json()) as Body };
}

beforeEach(() => {
  setTestEnv(vi);
  resetMockActionState();
  resetMockAuditState();
  resetAllScenarios();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockActionState();
  resetMockAuditState();
  resetAllScenarios();
});

describe("audit read API: authentication and authorization", () => {
  it("returns 401 without a valid session for list and detail", async () => {
    const { response, body } = await list("", null);
    expect(response.status).toBe(401);
    expect(body.error.code).toBe("unauthenticated");
    expect((await handleGetAuditEvent(await get("/api/audit-events/evt_seed_0001", null), "evt_seed_0001")).status).toBe(401);
  });

  it("lets both existing roles read (audit:view is granted to viewer and reviewer)", async () => {
    // No current role lacks audit:view, so the 403 branch cannot be reached
    // with real roles; the permission mapping itself is covered in policy.test.ts.
    expect((await list("", VIEWER_BOTH)).response.status).toBe(200);
    expect((await list("", REVIEWER_BOTH)).response.status).toBe(200);
  });

  it("is read-only: no write methods are exported for the route", async () => {
    const mod = await import("@/app/api/audit-events/route");
    expect(Object.keys(mod).sort()).toEqual(["GET"]);
  });
});

describe("audit read API: tenant isolation and browser claims", () => {
  it("returns only the principal's tenants and never exposes tenantId", async () => {
    const both = await list("?pageSize=100", REVIEWER_BOTH);
    const main = await list("?pageSize=100", REVIEWER_MAIN);
    expect(main.body.pagination.total).toBeLessThan(both.body.pagination.total);
    expect(JSON.stringify(both.body)).not.toContain("tenantId");
    const mainActionIds = new Set(
      listMockActions()
        .filter((a) => a.targetRecord.tenantId === "tenant_main")
        .map((a) => a.id),
    );
    for (const item of main.body.items) {
      if (item.actionId) expect(mainActionIds.has(item.actionId)).toBe(true);
    }
  });

  it("answers cross-tenant and missing event detail with the same 404", async () => {
    const east = (await list("?pageSize=100", REVIEWER_BOTH)).body.items.find(
      (item) =>
        listMockActions().find((a) => a.id === item.actionId)?.targetRecord.tenantId === "tenant_east",
    )!;
    const cross = await handleGetAuditEvent(await get(`/api/audit-events/${east.id}`, REVIEWER_MAIN), east.id);
    const missing = await handleGetAuditEvent(await get("/api/audit-events/evt_nope", REVIEWER_MAIN), "evt_nope");
    expect(cross.status).toBe(404);
    expect(missing.status).toBe(404);
    const strip = async (r: Response) => {
      const { error } = (await r.json()) as { error: { code: string; message: string } };
      return { code: error.code, message: error.message };
    };
    expect(await strip(cross)).toEqual(await strip(missing));
    expect((await handleGetAuditEvent(await get(`/api/audit-events/${east.id}`, REVIEWER_BOTH), east.id)).status).toBe(200);
  });

  it("rejects forged tenantId, actorId and role query parameters", async () => {
    for (const query of ["?tenantId=tenant_east", "?actorId=usr_dev_reviewer", "?role=reviewer"]) {
      const { response, body } = await list(query, REVIEWER_MAIN);
      expect(response.status).toBe(400);
      expect(body.error.code).toBe("invalid_query");
    }
  });

  it("fails closed if a backend returns an event outside the principal's tenants", async () => {
    const leaked = {
      id: "evt_x",
      tenantId: "tenant_east",
      eventType: "decision.accepted",
      outcome: "success",
      occurredAt: "2026-10-01T00:00:00.000Z",
      actorType: "user",
      summary: "x",
    } as const;
    const response = await handleListAuditEvents(await get("/api/audit-events", REVIEWER_MAIN), {
      audit: {
        kind: "mock",
        record: async () => undefined,
        get: async () => leaked,
        list: async () => ({ items: [leaked], pagination: { page: 1, pageSize: 10, total: 1 } }),
      },
    });
    expect(response.status).toBe(502);
    const detail = await handleGetAuditEvent(await get("/api/audit-events/evt_x", REVIEWER_MAIN), "evt_x", {
      audit: { kind: "mock", record: async () => undefined, list: async () => ({ items: [], pagination: { page: 1, pageSize: 10, total: 0 } }), get: async () => leaked },
    });
    expect(detail.status).toBe(404);
  });
});

describe("audit read API: query behavior", () => {
  it("paginates, sorts and filters", async () => {
    const first = await list("?pageSize=10", REVIEWER_BOTH);
    expect(first.body.items).toHaveLength(10);
    expect(first.body.pagination).toMatchObject({ page: 1, pageSize: 10 });
    const times = first.body.items.map((i: { occurredAt: string }) => Date.parse(i.occurredAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const asc = await list("?sortDirection=asc&pageSize=3", REVIEWER_BOTH);
    expect(asc.body.items[0].id).toBe("evt_seed_0001");

    const unknown = await list("?outcome=unknown&pageSize=100", REVIEWER_BOTH);
    expect(unknown.body.items.length).toBeGreaterThan(0);
    expect(unknown.body.items.every((i: { outcome: string }) => i.outcome === "unknown")).toBe(true);

    const range = await list(
      "?from=2026-10-01T08:00:00.000Z&to=2026-10-01T10:00:00.000Z&pageSize=100",
      REVIEWER_BOTH,
    );
    expect(range.body.items.length).toBeGreaterThan(0);
    for (const item of range.body.items) {
      expect(Date.parse(item.occurredAt)).toBeLessThanOrEqual(Date.parse("2026-10-01T10:00:00.000Z"));
    }

    const search = await list("?search=act_0002", REVIEWER_BOTH);
    expect(search.body.items.every((i: { actionId?: string }) => i.actionId === "act_0002")).toBe(true);
  });

  it("rejects invalid pagination, sort, filters and date ranges with sanitized errors", async () => {
    for (const query of ["?page=0", "?pageSize=1000", "?sortBy=actorId", "?eventType=x", "?from=2026-10-02T00:00:00.000Z&to=2026-10-01T00:00:00.000Z"]) {
      const { response, body } = await list(query);
      expect(response.status).toBe(400);
      expect(JSON.stringify(body)).not.toMatch(/stack|usr_test|unit-test-secret/);
    }
  });

  it("sanitizes backend failures", async () => {
    setAuditScenario({ kind: "server-error" });
    const { response, body } = await list("");
    expect(response.status).toBe(502);
    expect(body.error.code).toBe("bad_gateway");
    expect(JSON.stringify(body)).not.toContain("Mock upstream");
  });
});

describe("bridge audit stays unavailable (no silent mock fallback)", () => {
  it("returns 503 audit_unavailable when mock mode is off or in a production build without the flag", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "");
    const off = await list("");
    expect(off.response.status).toBe(503);
    expect(off.body.error.code).toBe("audit_unavailable");

    setTestEnv(vi);
    vi.stubEnv("NODE_ENV", "production");
    expect((await list("")).response.status).toBe(503);
    vi.stubEnv("ALLOW_MOCK_BACKEND_IN_PRODUCTION", "true");
    expect((await list("")).response.status).toBe(200);
  });
});

describe("audit semantics for decisions", () => {
  const recorded = () => getRecordedMockAuditEvents();

  it("records one accepted event with the session actor, no reason text, and no execution claim", async () => {
    const a = pendingIn("tenant_main");
    const response = await decide(a.id, REVIEWER_BOTH, {
      decision: "approve",
      recordVersion: a.recordVersion,
      reason: "customer verified by phone 555-0100",
    });
    expect(response.status).toBe(200);
    expect(recorded()).toHaveLength(1);
    const [event] = recorded();
    expect(event).toMatchObject({
      eventType: "decision.accepted",
      outcome: "success",
      actorId: REVIEWER_BOTH.sub,
      actionId: a.id,
      tenantId: "tenant_main",
      details: { decision: "approve", recordVersion: a.recordVersion, reasonProvided: true, resultingStatus: "approved" },
    });
    expect(JSON.stringify(event)).not.toContain("555-0100");
    expect(event!.summary).toMatch(/not been performed/i);
    expect(event!.requestId).toMatch(/^req_/);

    const read = await list(`?actionId=${a.id}`);
    expect(read.body.items.some((i: { eventType: string }) => i.eventType === "decision.accepted")).toBe(true);
  });

  it("does not duplicate the event when an idempotent request is replayed", async () => {
    const a = pendingIn("tenant_main");
    const body = { decision: "approve", recordVersion: a.recordVersion };
    await decide(a.id, REVIEWER_BOTH, body);
    const replay = await decide(a.id, REVIEWER_BOTH, body);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(recorded()).toHaveLength(1);
  });

  it("records conflicts for a stale version and for a non-pending action", async () => {
    const a = pendingIn("tenant_main");
    await decide(a.id, REVIEWER_BOTH, { decision: "approve", recordVersion: a.recordVersion + 3 });
    const approved = listMockActions().find((x) => x.status === "approved" && x.targetRecord.tenantId === "tenant_main")!;
    await decide(approved.id, REVIEWER_BOTH, { decision: "approve", recordVersion: approved.recordVersion }, "idem-key-other-0123456789");
    expect(recorded().map((e) => [e.eventType, e.outcome, e.details?.conflictCode])).toEqual([
      ["decision.conflict", "rejected", "version_conflict"],
      ["decision.conflict", "rejected", "invalid_transition"],
    ]);
  });

  it("records a denial for a viewer in their own tenant", async () => {
    const a = pendingIn("tenant_main");
    const response = await decide(a.id, VIEWER_BOTH, { decision: "approve", recordVersion: a.recordVersion });
    expect(response.status).toBe(403);
    expect(recorded()).toHaveLength(1);
    expect(recorded()[0]).toMatchObject({ eventType: "decision.denied", outcome: "rejected", actorId: VIEWER_BOTH.sub });
  });

  it("records nothing for unauthenticated, cross-tenant or invalid requests", async () => {
    const east = pendingIn("tenant_east");
    expect((await decide(east.id, null, { decision: "approve", recordVersion: 1 })).status).toBe(401);
    expect((await decide(east.id, REVIEWER_MAIN, { decision: "approve", recordVersion: east.recordVersion })).status).toBe(404);
    expect((await decide(east.id, REVIEWER_BOTH, { decision: "approve", recordVersion: 1, actorId: "evil" })).status).toBe(400);
    const viewerCross = await decide(east.id, { ...VIEWER_BOTH, tenants: ["tenant_main"] }, { decision: "approve", recordVersion: 1 });
    expect(viewerCross.status).toBe(403);
    expect(recorded()).toHaveLength(0);
  });

  it("records an unknown outcome (never a success) on timeout and on a lost response", async () => {
    const a = pendingIn("tenant_main");
    const body = { decision: "approve", recordVersion: a.recordVersion };
    setDecisionScenario({ kind: "network-error" });
    expect((await decide(a.id, REVIEWER_BOTH, body)).status).toBe(504);
    setDecisionScenario({ kind: "lost-response" });
    expect((await decide(a.id, REVIEWER_BOTH, body, "idem-key-lost-0123456789")).status).toBe(504);
    expect(recorded().map((e) => [e.eventType, e.outcome])).toEqual([
      ["decision.outcome_unknown", "unknown"],
      ["decision.outcome_unknown", "unknown"],
    ]);
  });

  it("does not let an audit write failure change the decision outcome", async () => {
    const a = pendingIn("tenant_main");
    const request = new Request(`${ORIGIN}/api/actions/${a.id}/approve`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "idempotency-key": KEY,
        cookie: await sessionCookie(REVIEWER_BOTH),
      },
      body: JSON.stringify({ decision: "approve", recordVersion: a.recordVersion }),
    });
    const response = await handleDecision(request, a.id, "approve", {
      audit: { kind: "mock", record: async () => Promise.reject(new Error("down")), list: async () => { throw new Error("x"); }, get: async () => undefined },
    });
    expect(response.status).toBe(200);
  });
});
