import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { handlers } from "@/mocks/handlers";
import {
  resetActionsScenario,
  setActionsScenario,
} from "@/mocks/handlers/actions";
import { actionFixtures } from "@/mocks/fixtures/actions";
import { createHttpActionsService } from "./actions-service";
import { ActionsServiceError } from "./actions-service-error";

const BASE = "http://api.test";
const server = setupServer(...handlers);
const service = createHttpActionsService({ baseUrl: BASE, decisionsEnabled: true });

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetActionsScenario();
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

describe("createHttpActionsService.listActions", () => {
  it("returns a validated page from the MSW handler", async () => {
    const result = await service.listActions({ page: 1, pageSize: 5 });
    expect(result.items).toHaveLength(5);
    expect(result.pagination).toEqual({ page: 1, pageSize: 5, total: actionFixtures.length });
  });

  it("sends the query as URL parameters and honours filters, sort and search", async () => {
    let seen = "";
    server.use(
      http.get(`${BASE}/api/actions`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json({
          items: [],
          pagination: { page: 2, pageSize: 10, total: 0 },
        });
      }),
    );
    await service.listActions({
      page: 2,
      pageSize: 10,
      status: "pending",
      risk: "high",
      search: "tax",
      sortBy: "risk",
      sortDirection: "desc",
    });
    expect(new URLSearchParams(seen).toString()).toBe(
      "page=2&pageSize=10&status=pending&risk=high&search=tax&sortBy=risk&sortDirection=desc",
    );
  });

  it("filters server-side through the real handler", async () => {
    const result = await service.listActions({ status: "pending", risk: "critical", pageSize: 100 });
    expect(result.items.every((a) => a.status === "pending" && a.risk === "critical")).toBe(true);
  });

  it("maps a 400 validation response to an http error with its code", async () => {
    server.use(
      http.get(`${BASE}/api/actions`, () =>
        HttpResponse.json(
          { error: { code: "invalid_query", message: "Bad query." } },
          { status: 400 },
        ),
      ),
    );
    const error = await failure(service.listActions({ page: 1 }));
    expect(error).toMatchObject({ kind: "http", status: 400, code: "invalid_query" });
  });

  it("rejects invalid parameters in the MSW handler itself", async () => {
    const error = await failure(
      service.listActions({ pageSize: 1000 }),
    );
    expect(error).toMatchObject({ kind: "http", status: 400, code: "invalid_query" });
  });

  it("surfaces server errors with the request id", async () => {
    setActionsScenario({ kind: "server-error", requestId: "req_42" });
    const error = await failure(service.listActions({}));
    expect(error).toMatchObject({ kind: "http", status: 500, requestId: "req_42" });
  });

  it("handles an error body that is not the documented shape", async () => {
    server.use(
      http.get(`${BASE}/api/actions`, () => new HttpResponse("oops", { status: 502 })),
    );
    const error = await failure(service.listActions({}));
    expect(error).toMatchObject({ kind: "http", status: 502 });
    expect(error.code).toBeUndefined();
  });

  it("rejects a payload that violates the domain schema", async () => {
    setActionsScenario({ kind: "malformed" });
    expect(await failure(service.listActions({}))).toMatchObject({ kind: "malformed" });
  });

  it("rejects a body that is not JSON", async () => {
    server.use(
      http.get(`${BASE}/api/actions`, () => new HttpResponse("<html>", { status: 200 })),
    );
    expect(await failure(service.listActions({}))).toMatchObject({ kind: "malformed" });
  });

  it("maps transport failures to a network error", async () => {
    server.use(http.get(`${BASE}/api/actions`, () => HttpResponse.error()));
    expect(await failure(service.listActions({}))).toMatchObject({ kind: "network" });
  });

  it("propagates aborts unchanged so the query can be cancelled", async () => {
    setActionsScenario({ kind: "ok", delayMs: 200 });
    const controller = new AbortController();
    const pending = service.listActions({}, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("createHttpActionsService.bulkDecision", () => {
  const decisions = [
    {
      actionId: "act_0001",
      decision: "approve" as const,
      recordVersion: 1,
      idempotencyKey: "bulk-key-000000000001",
    },
    {
      actionId: "act_0002",
      decision: "reject" as const,
      recordVersion: 4,
      idempotencyKey: "bulk-key-000000000002",
    },
  ];

  it("sends the strict item-keyed payload and validates per-item outcomes", async () => {
    let seen: unknown;
    server.use(
      http.post(`${BASE}/api/actions/bulk-decision`, async ({ request }) => {
        seen = await request.json();
        return HttpResponse.json({
          results: [
            {
              actionId: "act_0001",
              decision: "approve",
              outcome: "approved",
              status: "approved",
              recordVersion: 2,
              message: "Approval accepted.",
            },
            {
              actionId: "act_0002",
              decision: "reject",
              outcome: "conflict",
              message: "The action changed.",
            },
          ],
        });
      }),
    );

    const result = await service.bulkDecision({ decisions });
    expect(seen).toEqual({ decisions });
    expect(result.results.map((item) => item.outcome)).toEqual([
      "approved",
      "conflict",
    ]);
  });

  it("classifies an unconfirmable response as an unknown outcome", async () => {
    server.use(
      http.post(`${BASE}/api/actions/bulk-decision`, () =>
        HttpResponse.json({
          results: [
            {
              actionId: "act_0001",
              decision: "approve",
              outcome: "approved",
              status: "approved",
              recordVersion: 2,
              message: "Approval accepted.",
            },
          ],
        }),
      ),
    );
    expect(
      await failure(service.bulkDecision({ decisions })),
    ).toMatchObject({ kind: "unknown-outcome" });
  });

  it("keeps the real-backend unavailable response distinct from unknown", async () => {
    server.use(
      http.post(`${BASE}/api/actions/bulk-decision`, () =>
        HttpResponse.json(
          {
            error: {
              code: "decisions_unavailable",
              message: "No verified backend is configured.",
            },
          },
          { status: 503 },
        ),
      ),
    );
    expect(
      await failure(service.bulkDecision({ decisions })),
    ).toMatchObject({ kind: "unavailable", status: 503 });
  });
});
