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
  it("validates list and detail responses for valid run IDs", async () => {
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
    const encodedIdRun = { ...runFixtures[0], id: "run_0100" };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [summary] }))
      .mockResolvedValueOnce(response({ run: encodedIdRun }));
    const service = createHttpRunsService({ fetchFn });

    const list = await service.listRuns();
    const run = await service.getRun("run_0100");

    expect(list.items).toHaveLength(1);
    expect(run.id).toBe("run_0100");
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      "/api/runs",
      "/api/runs/run_0100",
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

  it("maps unauthorized snapshots and rejects snapshots for another run", async () => {
    const otherRun = {
      ...runFixtures[0],
      id: "run_0101",
      events: runFixtures[0].events.map((event) => ({
        ...event,
        runId: "run_0101",
      })),
    };
    const service = createHttpRunsService({
      fetchFn: vi
        .fn()
        .mockResolvedValueOnce(
          response(
            { error: { code: "unauthenticated", message: "Sign in is required." } },
            401,
          ),
        )
        .mockResolvedValueOnce(response({ run: otherRun })),
    });

    await expect(service.getRun("run_0100")).rejects.toMatchObject({
      kind: "http",
      status: 401,
    } satisfies Partial<ActionsServiceError>);
    await expect(service.getRun("run_0100")).rejects.toMatchObject({
      kind: "malformed",
    } satisfies Partial<ActionsServiceError>);
  });

  it("deduplicates snapshot timeline events by ID and sequence", async () => {
    const run = runFixtures[0];
    const repeated = { ...run.events[0] };
    const service = createHttpRunsService({
      fetchFn: vi.fn().mockResolvedValue(
        response({ run: { ...run, events: [...run.events, repeated] } }),
      ),
    });

    const snapshot = await service.getRun(run.id);

    expect(snapshot.events).toHaveLength(run.events.length);
  });

  it("validates SSE events and disposes the transport", () => {
    const listeners = new Map<string, EventListener>();
    const removeEventListener = vi.fn((type: string) => listeners.delete(type));
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
      removeEventListener,
      addEventListener(type: string, listener: EventListener) {
        listeners.set(type, listener);
      },
    }) as unknown as EventSource;
    const onEvent = vi.fn();
    const onOpen = vi.fn();
    const onError = vi.fn();
    const onRecovery = vi.fn();
    const service = createHttpRunsService({
      createEventSource: () => source,
    });
    const unsubscribe = service.subscribeEvents("run_0100", {
      onEvent,
      onOpen,
      onError,
      onRecovery,
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
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });

  it("uses the last accepted cursor for a fresh subscription", () => {
    let url = "";
    const service = createHttpRunsService({
      createEventSource: (nextUrl) => {
        url = nextUrl;
        return {
          readyState: 0,
          onopen: null,
          onerror: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          close: vi.fn(),
        } as unknown as EventSource;
      },
    });

    const unsubscribe = service.subscribeEvents(
      "run_0100",
      { onEvent: vi.fn(), onOpen: vi.fn(), onError: vi.fn(), onRecovery: vi.fn() },
      { lastEventId: "run_0100_event_004" },
    );

    expect(url).toBe(
      "/api/runs/run_0100/events?cursor=run_0100_event_004",
    );
    unsubscribe();
  });

  it("stops after the configured number of reconnect errors", () => {
    const source = {
      readyState: 1,
      onopen: null as (() => void) | null,
      onerror: null as ((event: Event) => void) | null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as EventSource;
    const onError = vi.fn();
    const service = createHttpRunsService({
      createEventSource: () => source,
      maxReconnectAttempts: 2,
    });

    const unsubscribe = service.subscribeEvents("run_0100", {
      onEvent: vi.fn(),
      onOpen: vi.fn(),
      onError,
      onRecovery: vi.fn(),
    });

    source.onerror?.(new Event("error"));
    source.onerror?.(new Event("error"));
    source.onerror?.(new Event("error"));

    expect(onError.mock.calls.map(([status]) => status)).toEqual([
      "reconnecting",
      "disconnected",
    ]);
    expect(source.close).toHaveBeenCalledOnce();
    unsubscribe();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("validates recovery controls and closes a resolved recovery stream", () => {
    const listeners = new Map<string, EventListener>();
    const source = Object.assign(new EventTarget(), {
      readyState: 1,
      onopen: null,
      onerror: null,
      close: vi.fn(),
      removeEventListener(type: string) {
        listeners.delete(type);
      },
      addEventListener(type: string, listener: EventListener) {
        listeners.set(type, listener);
      },
    }) as unknown as EventSource;
    const onRecovery = vi.fn();
    const onError = vi.fn();
    const service = createHttpRunsService({
      createEventSource: () => source,
    });
    const unsubscribe = service.subscribeEvents("run_0100", {
      onEvent: vi.fn(),
      onOpen: vi.fn(),
      onError,
      onRecovery,
    });

    listeners.get("run-recovery")?.(
      new MessageEvent("run-recovery", {
        data: JSON.stringify({ runId: "run_0100", reason: "cursor-expired" }),
      }),
    );
    expect(onRecovery).toHaveBeenCalledWith({
      runId: "run_0100",
      reason: "cursor-expired",
    });
    expect(onError).not.toHaveBeenCalled();
    expect(source.close).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
