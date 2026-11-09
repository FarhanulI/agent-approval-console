import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMockDecisionLog, listMockActions, resetMockActionState } from "@/mocks/action-store";
import {
  getRecordedMockAuditEvents,
  resetMockAuditState,
} from "@/mocks/audit-store";
import { resetAllScenarios, setDecisionScenario } from "@/mocks/scenarios";
import {
  REVIEWER_BOTH,
  REVIEWER_MAIN,
  VIEWER_BOTH,
  sessionCookie,
  setTestEnv,
  type TestClaims,
} from "@/test/auth-helpers";
import { createBridgeBackend } from "./bridge-backend";
import {
  handleBulkDecision,
  handleDecision,
  handleGetAction,
  handleListActions,
} from "./handlers";
import { resetRateLimits } from "@/lib/server/rate-limit";

const ORIGIN = "http://localhost:3000";
const KEY = "idem-key-0123456789abcdef";

const pendingIn = (tenant: string) =>
  listMockActions().find((a) => a.status === "pending" && a.targetRecord.tenantId === tenant)!;

type DecisionOptions = {
  claims?: TestClaims | null;
  cookie?: string;
  body?: unknown;
  rawBody?: string;
  origin?: string | null;
  key?: string | null;
  contentType?: string | null;
};

async function decisionRequest(actionId: string, opts: DecisionOptions = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  else if (opts.claims !== null) headers.cookie = await sessionCookie(opts.claims ?? REVIEWER_BOTH);
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  if (opts.key !== null) headers["idempotency-key"] = opts.key ?? KEY;
  if (opts.contentType !== null) headers["content-type"] = opts.contentType ?? "application/json";
  return new Request(`${ORIGIN}/api/actions/${actionId}/approve`, {
    method: "POST",
    headers,
    body: opts.rawBody ?? JSON.stringify(opts.body ?? { decision: "approve", recordVersion: 1 }),
  });
}

function bulkItem(
  action: ReturnType<typeof pendingIn>,
  overrides: Record<string, unknown> = {},
) {
  return {
    actionId: action.id,
    decision: "approve",
    recordVersion: action.recordVersion,
    idempotencyKey: `bulk-key-${action.id}-00000000`,
    ...overrides,
  };
}

async function bulkRequest(
  decisions: unknown[],
  claims: TestClaims | null = REVIEWER_BOTH,
) {
  const headers: Record<string, string> = {
    origin: ORIGIN,
    "content-type": "application/json",
  };
  if (claims) headers.cookie = await sessionCookie(claims);
  return new Request(`${ORIGIN}/api/actions/bulk-decision`, {
    method: "POST",
    headers,
    body: JSON.stringify({ decisions }),
  });
}

async function get(path: string, claims: TestClaims | null = REVIEWER_BOTH, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  else if (claims) headers.cookie = await sessionCookie(claims);
  return new Request(`${ORIGIN}${path}`, { headers });
}

beforeEach(() => {
  setTestEnv(vi);
  resetMockActionState();
  resetMockAuditState();
  resetAllScenarios();
  resetRateLimits();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockActionState();
  resetMockAuditState();
  resetAllScenarios();
  resetRateLimits();
});

async function errorCode(response: Response) {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe("AUTH-002 structured authentication errors", () => {
  it("returns 401 for unauthenticated list, detail and decision requests", async () => {
    for (const response of [
      await handleListActions(await get("/api/actions", null)),
      await handleGetAction(await get("/api/actions/act_0001", null), "act_0001"),
      await handleDecision(await decisionRequest("act_0001", { claims: null }), "act_0001", "approve"),
    ]) {
      expect(response.status).toBe(401);
      expect(await errorCode(response)).toBe("unauthenticated");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("fails closed for tampered, expired, wrongly signed sessions and a missing secret", async () => {
    const valid = await sessionCookie(REVIEWER_BOTH);
    const expired = await sessionCookie(REVIEWER_BOTH, { maxAge: -120 });
    const wrongSecret = await sessionCookie(REVIEWER_BOTH, {
      secret: "another-secret-another-secret-0123456789",
    });
    for (const cookie of [valid.slice(0, -4) + "AAAA", expired, wrongSecret, "next-auth.session-token=garbage"]) {
      const response = await handleListActions(await get("/api/actions", null, cookie));
      expect(response.status).toBe(401);
    }
    vi.stubEnv("AUTH_SECRET", "");
    expect((await handleListActions(await get("/api/actions", REVIEWER_BOTH))).status).toBe(401);
  });

  it("rejects a session whose claims are malformed or grant an unknown role", async () => {
    const bad = [
      { ...REVIEWER_BOTH, role: "admin" },
      { ...REVIEWER_BOTH, tenants: [] },
    ];
    for (const claims of bad) {
      expect((await handleListActions(await get("/api/actions", claims))).status).toBe(401);
    }
  });

  it("does not leak session contents or secrets in error bodies", async () => {
    const cookie = await sessionCookie(REVIEWER_BOTH);
    const response = await handleListActions(await get("/api/actions?page=0", REVIEWER_BOTH));
    const text = JSON.stringify(await response.json());
    expect(text).not.toContain(cookie.split("=")[1]);
    expect(text).not.toContain("usr_test_reviewer");
    expect(text).not.toContain("unit-test-secret");
  });
});

describe("TENANT-001 tenant isolation", () => {
  it("lists only the principal's tenants", async () => {
    const response = await handleListActions(await get("/api/actions?pageSize=100", REVIEWER_MAIN));
    const body = (await response.json()) as { items: { targetRecord: { tenantId: string } }[] };
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items.every((item) => item.targetRecord.tenantId === "tenant_main")).toBe(true);
  });

  it("returns the same 404 for a cross-tenant action as for a missing one", async () => {
    const east = pendingIn("tenant_east");
    const cross = await handleGetAction(await get(`/api/actions/${east.id}`, REVIEWER_MAIN), east.id);
    const missing = await handleGetAction(await get("/api/actions/act_9999", REVIEWER_MAIN), "act_9999");
    expect(cross.status).toBe(404);
    expect(await cross.json()).toMatchObject({ error: { code: "not_found", message: "Action not found." } });
    expect(missing.status).toBe(404);
  });

  it("denies a cross-tenant decision without changing state", async () => {
    const east = pendingIn("tenant_east");
    const response = await handleDecision(
      await decisionRequest(east.id, { claims: REVIEWER_MAIN, body: { decision: "approve", recordVersion: east.recordVersion } }),
      east.id,
      "approve",
    );
    expect(response.status).toBe(404);
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("ignores a client-supplied tenant claim", async () => {
    const east = pendingIn("tenant_east");
    const request = await decisionRequest(east.id, {
      claims: REVIEWER_MAIN,
      body: { decision: "approve", recordVersion: east.recordVersion, tenantId: "tenant_east" },
    });
    const response = await handleDecision(request, east.id, "approve");
    expect(response.status).toBe(400);
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("fails closed if a backend returns a record outside the principal's tenants", async () => {
    const leaky = createBridgeBackend();
    const all = listMockActions();
    const response = await handleListActions(await get("/api/actions", REVIEWER_MAIN), {
      backend: {
        ...leaky,
        kind: "mock",
        listActions: async () => ({ items: all.slice(0, 8), pagination: { page: 1, pageSize: 10, total: 8 } }),
      },
    });
    expect(response.status).toBe(502);
  });
});

describe("AUTHZ-001 decision permission", () => {
  it("forbids a viewer from approving or rejecting", async () => {
    const action = pendingIn("tenant_main");
    for (const decision of ["approve", "reject"] as const) {
      const response = await handleDecision(
        await decisionRequest(action.id, { claims: VIEWER_BOTH, body: { decision, recordVersion: action.recordVersion } }),
        action.id,
        decision,
      );
      expect(response.status).toBe(403);
    }
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("lets a viewer read", async () => {
    const response = await handleListActions(await get("/api/actions", VIEWER_BOTH));
    expect(response.status).toBe(200);
  });

  it("does not let a client-supplied role grant permission", async () => {
    const action = pendingIn("tenant_main");
    const response = await handleDecision(
      await decisionRequest(action.id, {
        claims: VIEWER_BOTH,
        body: { decision: "approve", recordVersion: action.recordVersion, role: "reviewer" },
      }),
      action.id,
      "approve",
    );
    expect(response.status).toBe(403);
    const viaHeader = await decisionRequest(action.id, { claims: VIEWER_BOTH, body: { decision: "approve", recordVersion: action.recordVersion } });
    viaHeader.headers.set("x-role", "reviewer");
    expect((await handleDecision(viaHeader, action.id, "approve")).status).toBe(403);
  });
});

describe("AUTH-003 trusted actor identity", () => {
  it("uses the session user as actor and rejects a forged actorId", async () => {
    const action = pendingIn("tenant_main");
    const forged = await handleDecision(
      await decisionRequest(action.id, {
        body: { decision: "approve", recordVersion: action.recordVersion, actorId: "evil" },
      }),
      action.id,
      "approve",
    );
    expect(forged.status).toBe(400);
    expect(getMockDecisionLog()).toHaveLength(0);

    const ok = await handleDecision(
      await decisionRequest(action.id, { body: { decision: "approve", recordVersion: action.recordVersion } }),
      action.id,
      "approve",
    );
    expect(ok.status).toBe(200);
    expect(getMockDecisionLog()).toEqual([
      { decision: "approve", recordVersion: action.recordVersion, actorId: REVIEWER_BOTH.sub },
    ]);
  });
});

describe("DECISION-BOUNDARY-001 server-side validation", () => {
  it("rejects a non-pending action through a direct request", async () => {
    const approved = listMockActions().find((a) => a.status === "approved" && a.targetRecord.tenantId === "tenant_main")!;
    const response = await handleDecision(
      await decisionRequest(approved.id, { body: { decision: "approve", recordVersion: approved.recordVersion } }),
      approved.id,
      "approve",
    );
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("invalid_transition");
  });

  it("rejects a stale recordVersion", async () => {
    const action = pendingIn("tenant_main");
    const response = await handleDecision(
      await decisionRequest(action.id, { body: { decision: "approve", recordVersion: action.recordVersion + 5 } }),
      action.id,
      "approve",
    );
    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe("version_conflict");
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("validates content type, body, decision/route match and key", async () => {
    const a = pendingIn("tenant_main");
    const ok = { decision: "approve", recordVersion: a.recordVersion };
    expect((await handleDecision(await decisionRequest(a.id, { contentType: "text/plain" }), a.id, "approve")).status).toBe(415);
    expect((await handleDecision(await decisionRequest(a.id, { rawBody: "{nope" }), a.id, "approve")).status).toBe(400);
    expect((await handleDecision(await decisionRequest(a.id, { body: { ...ok, decision: "reject" } }), a.id, "approve")).status).toBe(400);
    expect((await handleDecision(await decisionRequest(a.id, { key: null }), a.id, "approve")).status).toBe(400);
    expect((await handleDecision(await decisionRequest(a.id, { key: "short" }), a.id, "approve")).status).toBe(400);
    expect((await handleDecision(await decisionRequest("bad id!", { body: ok }), "bad id!", "approve")).status).toBe(400);
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("rejects oversized decision bodies before JSON validation", async () => {
    const action = pendingIn("tenant_main");
    const response = await handleDecision(
      await decisionRequest(action.id, { rawBody: "x".repeat(8 * 1024 + 1) }),
      action.id,
      "approve",
    );
    expect(response.status).toBe(413);
    expect(await errorCode(response)).toBe("payload_too_large");
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("answers 404 for a missing action", async () => {
    const response = await handleDecision(await decisionRequest("act_9999"), "act_9999", "approve");
    expect(response.status).toBe(404);
  });
});

describe("SECURITY-003 per-user decision rate limit", () => {
  it("limits authenticated decision attempts and returns Retry-After", async () => {
    const action = pendingIn("tenant_main");
    const cookie = await sessionCookie(REVIEWER_BOTH);
    let response: Response | undefined;
    for (let attempt = 0; attempt < 31; attempt += 1) {
      response = await handleDecision(
        await decisionRequest(action.id, {
          cookie,
          body: { decision: "approve", recordVersion: -1 },
        }),
        action.id,
        "approve",
      );
    }

    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(await errorCode(response!)).toBe("rate_limited");
    expect(getMockDecisionLog()).toHaveLength(0);
  });
});

describe("SECURITY-001 CSRF at the request boundary", () => {
  it("rejects missing and cross-site origins before authentication", async () => {
    const a = pendingIn("tenant_main");
    for (const origin of [null, "https://evil.example", "http://localhost:3000.evil.example"]) {
      const response = await handleDecision(await decisionRequest(a.id, { origin }), a.id, "approve");
      expect(response.status).toBe(403);
      expect(await errorCode(response)).toBe("invalid_origin");
    }
    expect(getMockDecisionLog()).toHaveLength(0);
  });
});

describe("IDEMPOTENCY-001 and unknown outcomes", () => {
  it("replays the original result for the same key and rejects key reuse", async () => {
    const a = pendingIn("tenant_main");
    const body = { decision: "approve", recordVersion: a.recordVersion };
    const first = await handleDecision(await decisionRequest(a.id, { body }), a.id, "approve");
    const replay = await handleDecision(await decisionRequest(a.id, { body }), a.id, "approve");
    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(getMockDecisionLog()).toHaveLength(1);

    const reuse = await handleDecision(await decisionRequest(a.id, { body: { ...body, reason: "different" } }), a.id, "approve");
    expect(reuse.status).toBe(422);
    expect(await errorCode(reuse)).toBe("idempotency_key_reuse");
  });

  it("does not replay another user's key", async () => {
    const a = pendingIn("tenant_main");
    const body = { decision: "approve", recordVersion: a.recordVersion };
    await handleDecision(await decisionRequest(a.id, { body }), a.id, "approve");
    const other = await handleDecision(await decisionRequest(a.id, { claims: REVIEWER_MAIN, body }), a.id, "approve");
    expect(other.status).toBe(409);
  });

  it("reports an unknown outcome (not a confirmed failure) on timeout and lost response", async () => {
    const a = pendingIn("tenant_main");
    const body = { decision: "approve", recordVersion: a.recordVersion };
    setDecisionScenario({ kind: "network-error" });
    const timeout = await handleDecision(await decisionRequest(a.id, { body }), a.id, "approve");
    expect(timeout.status).toBe(504);
    expect(await errorCode(timeout)).toBe("decision_outcome_unknown");

    setDecisionScenario({ kind: "lost-response" });
    const lost = await handleDecision(await decisionRequest(a.id, { body }), a.id, "approve");
    expect(lost.status).toBe(504);
    expect(getMockDecisionLog()).toHaveLength(1); // committed although the response was lost

    setDecisionScenario({ kind: "ok" });
    const retrySameKey = await handleDecision(await decisionRequest(a.id, { body }), a.id, "approve");
    expect(retrySameKey.headers.get("idempotency-replayed")).toBe("true");
    expect(getMockDecisionLog()).toHaveLength(1);
  });
});

describe("real decision adapter stays unavailable (no silent mock fallback)", () => {
  it("returns 503 decisions_unavailable and sends nothing when mock mode is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "");
    const a = pendingIn("tenant_main");
    const response = await handleDecision(await decisionRequest(a.id), a.id, "approve");
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("decisions_unavailable");
    expect(getMockDecisionLog()).toHaveLength(0);
    expect((await handleListActions(await get("/api/actions"))).status).toBe(503);
  });

  it("does not activate mock mode in a production build without the explicit server flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const a = pendingIn("tenant_main");
    expect((await handleDecision(await decisionRequest(a.id), a.id, "approve")).status).toBe(503);
    vi.stubEnv("ALLOW_MOCK_BACKEND_IN_PRODUCTION", "true");
    expect((await handleListActions(await get("/api/actions"))).status).toBe(200);
  });
});

describe("BULK-DECISION-001 per-item mock workflow", () => {
  it("returns independent results for a successful item and a version conflict", async () => {
    const approved = pendingIn("tenant_main");
    const stale = listMockActions().find(
      (action) =>
        action.status === "pending" &&
        action.targetRecord.tenantId === "tenant_east" &&
        action.id !== approved.id,
    )!;
    const response = await handleBulkDecision(
      await bulkRequest([
        bulkItem(approved),
        bulkItem(stale, { recordVersion: stale.recordVersion + 1 }),
      ]),
    );
    const body = (await response.json()) as {
      results: Array<{ actionId: string; outcome: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      { actionId: approved.id, decision: "approve", outcome: "approved", status: "approved", recordVersion: approved.recordVersion + 1, message: "Approval accepted. Execution has not been performed." },
      { actionId: stale.id, decision: "approve", outcome: "conflict", message: "The action changed after it was loaded." },
    ]);
    expect(getMockDecisionLog()).toHaveLength(1);
    expect(
      getRecordedMockAuditEvents()
        .map((event) => event.eventType)
        .sort(),
    ).toEqual(["decision.accepted", "decision.conflict"]);
  });

  it("supports bulk rejection without equating it with execution", async () => {
    const action = pendingIn("tenant_main");
    const response = await handleBulkDecision(
      await bulkRequest([bulkItem(action, { decision: "reject" })]),
    );
    const body = (await response.json()) as {
      results: Array<{ outcome: string; status: string }>;
    };

    expect(body.results).toEqual([
      expect.objectContaining({ outcome: "rejected", status: "rejected" }),
    ]);
    expect(getMockDecisionLog()).toMatchObject([
      { decision: "reject", actorId: REVIEWER_BOTH.sub },
    ]);
    expect(getRecordedMockAuditEvents()).toMatchObject([
      { eventType: "decision.accepted", details: { decision: "reject" } },
    ]);
  });

  it("returns a non-disclosing forbidden result for cross-tenant actions", async () => {
    const east = pendingIn("tenant_east");
    const response = await handleBulkDecision(
      await bulkRequest([bulkItem(east)], REVIEWER_MAIN),
    );
    const body = (await response.json()) as {
      results: Array<{ outcome: string; message: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      {
        actionId: east.id,
        decision: "approve",
        outcome: "forbidden",
        message: "This action is unavailable to your account.",
      },
    ]);
    expect(getMockDecisionLog()).toHaveLength(0);
    expect(getRecordedMockAuditEvents()).toHaveLength(0);
  });

  it("returns forbidden and records a denial for a reviewer without decision permission", async () => {
    const action = pendingIn("tenant_main");
    const response = await handleBulkDecision(
      await bulkRequest([bulkItem(action)], VIEWER_BOTH),
    );
    const body = (await response.json()) as {
      results: Array<{ outcome: string }>;
    };

    expect(body.results[0].outcome).toBe("forbidden");
    expect(getMockDecisionLog()).toHaveLength(0);
    expect(getRecordedMockAuditEvents()).toMatchObject([
      {
        eventType: "decision.denied",
        actorId: VIEWER_BOTH.sub,
        actionId: action.id,
      },
    ]);
  });

  it("rejects malformed, actor-bearing, duplicate-action and shared-key requests", async () => {
    const first = pendingIn("tenant_main");
    const second = listMockActions().find(
      (action) =>
        action.status === "pending" &&
        action.targetRecord.tenantId === "tenant_main" &&
        action.id !== first.id,
    )!;
    const bodies = [
      { decisions: [bulkItem(first, { actorId: "untrusted" })] },
      { decisions: [bulkItem(first), bulkItem(first, { idempotencyKey: "bulk-key-second-00000000" })] },
      { decisions: [bulkItem(first), bulkItem(second, { idempotencyKey: bulkItem(first).idempotencyKey })] },
    ];

    for (const body of bodies) {
      const request = await bulkRequest(body.decisions);
      const invalid = new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(body),
      });
      expect((await handleBulkDecision(invalid)).status).toBe(400);
    }
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("uses a stable item key for idempotent replay without duplicate audit entries", async () => {
    const action = pendingIn("tenant_main");
    const request = await bulkRequest([bulkItem(action)]);
    const first = await handleBulkDecision(request);
    const replay = await handleBulkDecision(
      await bulkRequest([bulkItem(action)]),
    );
    const firstBody = (await first.json()) as { results: Array<{ outcome: string }> };
    const replayBody = (await replay.json()) as { results: Array<{ outcome: string }> };

    expect(firstBody.results[0].outcome).toBe("approved");
    expect(replayBody.results[0].outcome).toBe("approved");
    expect(getMockDecisionLog()).toHaveLength(1);
    expect(getRecordedMockAuditEvents()).toHaveLength(1);
  });

  it("deduplicates concurrent items with the same logical key", async () => {
    const action = pendingIn("tenant_main");
    const item = bulkItem(action);
    const [first, second] = await Promise.all([
      bulkRequest([item]),
      bulkRequest([item]),
    ]);
    const responses = await Promise.all([
      handleBulkDecision(first),
      handleBulkDecision(second),
    ]);
    const bodies = await Promise.all(
      responses.map(
        (response) =>
          response.json() as Promise<{
            results: Array<{ outcome: string }>;
          }>,
      ),
    );

    expect(bodies.map((body) => body.results[0].outcome)).toEqual([
      "approved",
      "approved",
    ]);
    expect(getMockDecisionLog()).toHaveLength(1);
    expect(getRecordedMockAuditEvents()).toHaveLength(1);
  });

  it("reports idempotency key reuse as a definite per-item failure", async () => {
    const action = pendingIn("tenant_main");
    const first = await handleDecision(
      await decisionRequest(action.id, {
        key: KEY,
        body: {
          decision: "approve",
          recordVersion: action.recordVersion,
          reason: "first request",
        },
      }),
      action.id,
      "approve",
    );
    expect(first.status).toBe(200);

    const bulk = await handleBulkDecision(
      await bulkRequest([
        bulkItem(action, {
          idempotencyKey: KEY,
          reason: "different logical decision",
        }),
      ]),
    );
    const body = (await bulk.json()) as {
      results: Array<{ outcome: string; message: string }>;
    };

    expect(body.results[0]).toEqual({
      actionId: action.id,
      decision: "approve",
      outcome: "failed",
      message: "This idempotency key belongs to a different decision.",
    });
    expect(getMockDecisionLog()).toHaveLength(1);
    expect(getRecordedMockAuditEvents()).toHaveLength(1);
  });

  it("does not allow one key to identify a different action", async () => {
    const first = pendingIn("tenant_main");
    const second = listMockActions().find(
      (action) =>
        action.status === "pending" &&
        action.targetRecord.tenantId === "tenant_main" &&
        action.id !== first.id,
    )!;
    const firstResponse = await handleDecision(
      await decisionRequest(first.id, {
        key: KEY,
        body: { decision: "approve", recordVersion: first.recordVersion },
      }),
      first.id,
      "approve",
    );
    expect(firstResponse.status).toBe(200);

    const response = await handleBulkDecision(
      await bulkRequest([
        bulkItem(second, { idempotencyKey: KEY }),
      ]),
    );
    const body = (await response.json()) as {
      results: Array<{ outcome: string }>;
    };

    expect(body.results[0].outcome).toBe("failed");
    expect(getMockDecisionLog()).toHaveLength(1);
  });

  it("reports unknown after a lost response and permits only explicit same-key replay", async () => {
    const action = pendingIn("tenant_main");
    const item = bulkItem(action);
    setDecisionScenario({ kind: "lost-response" });
    const first = await handleBulkDecision(await bulkRequest([item]));
    const firstBody = (await first.json()) as {
      results: Array<{ outcome: string }>;
    };
    expect(firstBody.results[0].outcome).toBe("outcome_unknown");
    expect(getMockDecisionLog()).toHaveLength(1);

    setDecisionScenario({ kind: "ok" });
    const replay = await handleBulkDecision(await bulkRequest([item]));
    const replayBody = (await replay.json()) as {
      results: Array<{ outcome: string }>;
    };
    expect(replayBody.results[0].outcome).toBe("approved");
    expect(getMockDecisionLog()).toHaveLength(1);
    expect(getRecordedMockAuditEvents().map((event) => event.eventType)).toEqual([
      "decision.outcome_unknown",
    ]);
  });

  it("fails closed when the bridge backend is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "");
    const action = pendingIn("tenant_main");
    const response = await handleBulkDecision(
      await bulkRequest([bulkItem(action)]),
    );

    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("decisions_unavailable");
    expect(getMockDecisionLog()).toHaveLength(0);
    expect(getRecordedMockAuditEvents()).toHaveLength(0);
  });
});
