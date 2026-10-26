import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMockDecisionLog, listMockActions, resetMockActionState } from "@/mocks/action-store";
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
import { handleDecision, handleGetAction, handleListActions } from "./handlers";

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

async function get(path: string, claims: TestClaims | null = REVIEWER_BOTH, cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  else if (claims) headers.cookie = await sessionCookie(claims);
  return new Request(`${ORIGIN}${path}`, { headers });
}

beforeEach(() => {
  setTestEnv(vi);
  resetMockActionState();
  resetAllScenarios();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetMockActionState();
  resetAllScenarios();
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

  it("answers 404 for a missing action", async () => {
    const response = await handleDecision(await decisionRequest("act_9999"), "act_9999", "approve");
    expect(response.status).toBe(404);
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
