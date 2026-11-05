import { describe, expect, it, vi } from "vitest";
import { runFixtures } from "@/mocks/fixtures/runs";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import { createHttpRunsService } from "./run-service";

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HTTP runs service", () => {
  it("validates list and detail responses and encodes run IDs", async () => {
    const fixture = runFixtures[0];
    const summary = {
      id: fixture.id,
      status: fixture.status,
      summary: fixture.summary,
      actionIds: fixture.actionIds,
      startedAt: fixture.startedAt,
      currentStep: fixture.currentStep,
      agent: fixture.agent,
    };
    const encodedIdRun = { ...runFixtures[0], id: "run/0100" };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [summary] }))
      .mockResolvedValueOnce(response({ run: encodedIdRun }));
    const service = createHttpRunsService({ fetchFn });

    const list = await service.listRuns();
    const run = await service.getRun("run/0100");

    expect(list.items).toHaveLength(1);
    expect(run.id).toBe("run/0100");
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      "/api/runs",
      "/api/runs/run%2F0100",
    ]);
  });

  it("maps 404 responses and rejects malformed snapshots", async () => {
    const service = createHttpRunsService({
      fetchFn: vi
        .fn()
        .mockResolvedValueOnce(response({ error: { code: "not_found", message: "Run not found." } }, 404))
        .mockResolvedValueOnce(response({ run: { id: "run_0100" } })),
    });

    await expect(service.getRun("run_0100")).rejects.toMatchObject({
      kind: "not-found",
    } satisfies Partial<ActionsServiceError>);
    await expect(service.getRun("run_0100")).rejects.toMatchObject({
      kind: "malformed",
    } satisfies Partial<ActionsServiceError>);
  });

  it("validates SSE events and disposes the transport", () => {
    const listeners = new Map<string, EventListener>();
    const source = Object.assign(new EventTarget(), {
      url: "/api/runs/run_0100/events",
      withCredentials: false,
      CONNECTING: 0,
      OPEN: 1,
      CLOSED: 2,
      readyState: 1,
      onopen: null,
      onmessage: null,
      onerror: null,
      close: vi.fn(),
      addEventListener(type: string, listener: EventListener) {
        listeners.set(type, listener);
      },
    }) as EventSource;
    const onEvent = vi.fn();
    const onOpen = vi.fn();
    const onError = vi.fn();
    const service = createHttpRunsService({
      createEventSource: () => source,
    });
    const unsubscribe = service.subscribeEvents("run_0100", {
      onEvent,
      onOpen,
      onError,
    });

    const validEvent = runFixtures[0].events[0];
    listeners.get("run-event")?.(
      new MessageEvent("run-event", { data: JSON.stringify(validEvent) }),
    );
    listeners.get("run-event")?.(
      new MessageEvent("run-event", { data: JSON.stringify({ ...validEvent, runId: "other" }) }),
    );

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(source.close).toHaveBeenCalledOnce();
  });
});
