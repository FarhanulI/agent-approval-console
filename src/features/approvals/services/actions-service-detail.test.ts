import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getMockDecisionLog, resetMockActionState } from "@/mocks/action-store";
import {
  resetDecisionScenario,
  resetDetailScenario,
  setDecisionScenario,
  setDetailScenario,
} from "@/mocks/handlers/action-details";
import { handlers } from "@/mocks/handlers";
import { createHttpActionsService } from "./actions-service";
import { ActionsServiceError } from "./actions-service-error";

const BASE = "http://api.test";
const server = setupServer(...handlers);
const service = createHttpActionsService({ baseUrl: BASE, decisionsEnabled: true });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetDetailScenario();
  resetDecisionScenario();
  resetMockActionState();
});
afterAll(() => server.close());

async function failure(promise: Promise<unknown>): Promise<ActionsServiceError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ActionsServiceError);
    return error as ActionsServiceError;
  }
  throw new Error("Expected the call to reject");
}

// Covers ACTION-DETAIL-001, ACTION-DETAIL-007.
describe("getAction", () => {
  it("returns a validated action", async () => {
    const action = await service.getAction("act_0001");
    expect(action).toMatchObject({ id: "act_0001", status: "pending", recordVersion: 1 });
    expect(action.evidence.length).toBeGreaterThan(0);
  });

  it("URL-encodes the id", async () => {
    let seen = "";
    server.use(
      http.get(`${BASE}/api/actions/:id`, ({ request }) => {
        seen = new URL(request.url).pathname;
        return HttpResponse.json({}, { status: 404 });
      }),
    );
    await failure(service.getAction("a/b ?x"));
    expect(seen).toBe("/api/actions/a%2Fb%20%3Fx");
  });

  it("maps 404 to not-found", async () => {
    const error = await failure(service.getAction("act_9999"));
    expect(error).toMatchObject({ kind: "not-found", status: 404, code: "not_found" });
  });

  it("maps a 400 for an invalid id to an http error, not not-found", async () => {
    const error = await failure(service.getAction("bad id!"));
    expect(error).toMatchObject({ kind: "http", status: 400, code: "invalid_request" });
  });

  it("maps 500 to http with the request id", async () => {
    setDetailScenario({ kind: "server-error", requestId: "req_1" });
    expect(await failure(service.getAction("act_0001"))).toMatchObject({
      kind: "http",
      status: 500,
      requestId: "req_1",
    });
  });

  it("maps a schema-invalid body to malformed", async () => {
    setDetailScenario({ kind: "malformed" });
    expect((await failure(service.getAction("act_0001"))).kind).toBe("malformed");
  });

  it("rejects a payload for a different action as malformed", async () => {
    const real = await service.getAction("act_0002");
    server.use(http.get(`${BASE}/api/actions/act_0001`, () => HttpResponse.json(real)));
    expect((await failure(service.getAction("act_0001"))).kind).toBe("malformed");
  });

  it("maps a connection failure to network", async () => {
    server.use(http.get(`${BASE}/api/actions/act_0001`, () => HttpResponse.error()));
    expect((await failure(service.getAction("act_0001"))).kind).toBe("network");
  });

  it("propagates an abort unchanged", async () => {
    setDetailScenario({ kind: "ok", delayMs: 500 });
    const controller = new AbortController();
    const pending = service.getAction("act_0001", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

// Covers DECISION-003, DECISION-005, DECISION-006, DECISION-008.
describe("decideAction", () => {
  const approve = { actionId: "act_0001", decision: "approve", recordVersion: 1 } as const;

  it("commits against MSW and reports approved, not executed", async () => {
    const result = await service.decideAction({ ...approve, reason: "ok" });
    expect(result).toMatchObject({
      actionId: "act_0001",
      decision: "approve",
      status: "approved",
      recordVersion: 2,
    });
    expect(result.status).not.toBe("executed");
    expect(getMockDecisionLog()).toHaveLength(1);
  });

  it("sends the displayed record version and no actor identity", async () => {
    let body: unknown;
    server.use(
      http.post(`${BASE}/api/actions/act_0005/reject`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          actionId: "act_0005",
          decision: "reject",
          status: "rejected",
          recordVersion: 6,
          message: "ok",
        });
      }),
    );
    await service.decideAction({ actionId: "act_0005", decision: "reject", recordVersion: 5 });
    expect(body).toEqual({ decision: "reject", recordVersion: 5 });
    expect(body).not.toHaveProperty("actorId");
  });

  it("is unavailable without sending a request when decisions are disabled", async () => {
    let calls = 0;
    const disabled = createHttpActionsService({
      baseUrl: BASE,
      decisionsEnabled: false,
      fetchFn: async () => {
        calls += 1;
        return new Response("{}");
      },
    });
    expect((await failure(disabled.decideAction(approve))).kind).toBe("unavailable");
    expect(calls).toBe(0);
  });

  it("defaults to unavailable unless the mocking flag is set (no silent mock fallback)", () => {
    expect(process.env.NEXT_PUBLIC_API_MOCKING).not.toBe("enabled");
    expect(createHttpActionsService({ baseUrl: BASE }).decisionsEnabled).toBe(false);
  });

  it("rejects a browser-supplied actorId at the handler (strict DTO)", async () => {
    const response = await fetch(`${BASE}/api/actions/act_0001/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve", recordVersion: 1, actorId: "evil" }),
    });
    expect(response.status).toBe(400);
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("maps a stale version to conflict (proposed 409 / version_conflict)", async () => {
    const error = await failure(service.decideAction({ ...approve, recordVersion: 99 }));
    expect(error).toMatchObject({ kind: "conflict", status: 409, code: "version_conflict" });
    expect(getMockDecisionLog()).toHaveLength(0);
  });

  it("maps a duplicate decision to conflict (invalid_transition) without a second commit", async () => {
    await service.decideAction(approve);
    const error = await failure(service.decideAction({ ...approve, recordVersion: 2 }));
    expect(error).toMatchObject({ kind: "conflict", code: "invalid_transition" });
    expect(getMockDecisionLog()).toHaveLength(1);
  });

  it("does not treat a 409 with an unknown code as a conflict", async () => {
    server.use(
      http.post(`${BASE}/api/actions/act_0001/approve`, () =>
        HttpResponse.json({ error: { code: "something_else", message: "No." } }, { status: 409 }),
      ),
    );
    expect((await failure(service.decideAction(approve))).kind).toBe("http");
  });

  it("maps 404 to not-found and 403 to http", async () => {
    expect(
      (await failure(service.decideAction({ ...approve, actionId: "act_9999" }))).kind,
    ).toBe("not-found");
    setDecisionScenario({ kind: "forbidden" });
    expect(await failure(service.decideAction(approve))).toMatchObject({
      kind: "http",
      status: 403,
    });
  });

  it("treats 5xx, malformed 2xx and connection loss as unknown-outcome", async () => {
    setDecisionScenario({ kind: "server-error" });
    expect((await failure(service.decideAction(approve))).kind).toBe("unknown-outcome");
    setDecisionScenario({ kind: "malformed" });
    expect((await failure(service.decideAction(approve))).kind).toBe("unknown-outcome");
    setDecisionScenario({ kind: "network-error" });
    expect((await failure(service.decideAction(approve))).kind).toBe("unknown-outcome");
  });

  it("treats a response for a different action as unknown-outcome", async () => {
    server.use(
      http.post(`${BASE}/api/actions/act_0001/approve`, () =>
        HttpResponse.json({
          actionId: "act_0002",
          decision: "approve",
          status: "approved",
          recordVersion: 2,
          message: "ok",
        }),
      ),
    );
    expect((await failure(service.decideAction(approve))).kind).toBe("unknown-outcome");
  });

  it("treats a timeout as unknown-outcome and never retries", async () => {
    let posts = 0;
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") posts += 1;
    });
    const quick = createHttpActionsService({
      baseUrl: BASE,
      decisionsEnabled: true,
      decisionTimeoutMs: 20,
    });
    setDecisionScenario({ kind: "ok", delayMs: 300 });
    expect((await failure(quick.decideAction(approve))).kind).toBe("unknown-outcome");
    expect(posts).toBe(1);
    server.events.removeAllListeners();
  });

  it("models a lost response: the decision was committed but the client sees unknown-outcome", async () => {
    setDecisionScenario({ kind: "lost-response" });
    expect((await failure(service.decideAction(approve))).kind).toBe("unknown-outcome");
    expect(getMockDecisionLog()).toHaveLength(1);
    expect((await service.getAction("act_0001")).status).toBe("approved");
  });
});
