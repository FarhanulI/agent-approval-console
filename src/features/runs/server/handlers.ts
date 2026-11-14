import { z } from "zod";
import { authorize } from "@/lib/auth/policy";
import { resolvePrincipal } from "@/lib/auth/principal";
import {
  errorResponse,
  forbidden,
  getRequestId,
  jsonResponse,
  unauthenticated,
} from "@/lib/server/http";
import {
  BackendError,
  type ActionsBackend,
} from "@/features/approvals/server/actions-backend";
import { getBackend } from "@/features/approvals/server/get-backend";
import {
  consumeRunStreamDisconnect,
  getRunsScenario,
} from "@/mocks/scenarios";
import type { RunEvent } from "../schemas/run";
import type { RunsBackend, RunContext } from "./runs-backend";
import { getRunsBackend } from "./get-runs-backend";
import { logServerEvent } from "@/lib/server/logger";

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const eventIdSchema = z.string().min(1).max(128);
type Deps = { backend?: RunsBackend; actions?: ActionsBackend };
type RunReadAuthorization =
  | { ok: false; response: Response }
  | { ok: true; context: RunContext };

function backendFailure(error: unknown, requestId: string) {
  if (error instanceof BackendError) {
    logServerEvent("warn", "runs-bff", "backend_request_failed", {
      requestId,
      errorCode: error.kind,
    });
    if (error.kind === "unavailable") {
      return errorResponse(
        503,
        "runs_unavailable",
        "Run monitoring is not available in this environment.",
        requestId,
      );
    }
    logServerEvent("error", "runs-bff", "unexpected_backend_error", {
      requestId,
      errorCode: "internal_error",
    });
    return errorResponse(
      error.kind === "timeout" ? 504 : 502,
      "bad_gateway",
      "The run backend could not complete the request.",
      requestId,
    );
  }
  return errorResponse(
    500,
    "internal_error",
    "An unexpected error occurred.",
    requestId,
  );
}

async function authorizeRunRead(
  request: Request,
  requestId: string,
): Promise<RunReadAuthorization> {
  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) {
    return { ok: false, response: unauthenticated(requestId) };
  }
  if (!authorize(auth.principal, "run:view").allowed) {
    return { ok: false, response: forbidden(requestId) };
  }
  return {
    ok: true,
    context: { requestId, principal: auth.principal } satisfies RunContext,
  };
}

async function hasValidActionReferences(
  runId: string,
  actionIds: readonly string[],
  tenantId: string,
  context: RunContext,
  actions: ActionsBackend,
): Promise<boolean> {
  if (actionIds.length === 0) return true;
  if (!authorize(context.principal, "action:view", { tenantId }).allowed) return false;

  for (const actionId of actionIds) {
    const action = await actions.getAction(context, actionId);
    if (
      !action ||
      action.targetRecord.tenantId !== tenantId ||
      action.runId !== runId
    ) {
      return false;
    }
  }
  return true;
}

export async function handleListRuns(
  request: Request,
  deps: Deps = {},
): Promise<Response> {
  const requestId = getRequestId(request);
  const authorized = await authorizeRunRead(request, requestId);
  if (!authorized.ok) return authorized.response;

  const backend = deps.backend ?? getRunsBackend();
  const actions = deps.actions ?? getBackend();
  if (backend.kind === "mock" && getRunsScenario().kind === "malformed") {
    return jsonResponse({ items: [{ id: "invalid" }] }, requestId);
  }
  try {
    const items = await backend.list(authorized.context);
    if (
      items.some(
        (entry) =>
          !authorize(authorized.context.principal, "run:view", {
            tenantId: entry.tenantId,
          }).allowed,
      )
    ) {
      return errorResponse(
        502,
        "bad_gateway",
        "The run backend could not complete the request.",
        requestId,
      );
    }
    for (const entry of items) {
      if (
        entry.summary.actionIds.length > 0 &&
        !authorize(authorized.context.principal, "action:view", {
          tenantId: entry.tenantId,
        }).allowed
      ) {
        return forbidden(requestId);
      }
      if (
        !(await hasValidActionReferences(
          entry.summary.id,
          entry.summary.actionIds,
          entry.tenantId,
          authorized.context,
          actions,
        ))
      ) {
        return errorResponse(
          502,
          "bad_gateway",
          "The run backend could not complete the request.",
          requestId,
        );
      }
    }
    return jsonResponse({ items: items.map((entry) => entry.summary) }, requestId);
  } catch (error) {
    return backendFailure(error, requestId);
  }
}

export async function handleGetRun(
  request: Request,
  runId: string,
  deps: Deps = {},
): Promise<Response> {
  const requestId = getRequestId(request);
  const authorized = await authorizeRunRead(request, requestId);
  if (!authorized.ok) return authorized.response;
  if (!RUN_ID_PATTERN.test(runId)) {
    return errorResponse(
      400,
      "invalid_request",
      "The run identifier is invalid.",
      requestId,
    );
  }

  const backend = deps.backend ?? getRunsBackend();
  const actions = deps.actions ?? getBackend();
  if (
    backend.kind === "mock" &&
    ["malformed", "snapshot-malformed"].includes(getRunsScenario().kind)
  ) {
    return jsonResponse({ run: { id: runId } }, requestId);
  }
  try {
    const stored = await backend.get(authorized.context, runId);
    if (
      !stored ||
      !authorize(authorized.context.principal, "run:view", {
        tenantId: stored.tenantId,
      }).allowed
    ) {
      return runNotFound(requestId);
    }
    if (stored.detail.id !== runId) {
      return errorResponse(
        502,
        "bad_gateway",
        "The run backend could not complete the request.",
        requestId,
      );
    }
    if (
      stored.detail.actionIds.length > 0 &&
      !authorize(authorized.context.principal, "action:view", {
        tenantId: stored.tenantId,
      }).allowed
    ) {
      return forbidden(requestId);
    }
    if (
      !(await hasValidActionReferences(
        stored.detail.id,
        stored.detail.actionIds,
        stored.tenantId,
        authorized.context,
        actions,
      ))
    ) {
      return errorResponse(
        502,
        "bad_gateway",
        "The run backend could not complete the request.",
        requestId,
      );
    }
    return jsonResponse({ run: stored.detail }, requestId);
  } catch (error) {
    return backendFailure(error, requestId);
  }
}

export async function handleSubscribeRunEvents(
  request: Request,
  runId: string,
  deps: Deps = {},
): Promise<Response> {
  const requestId = getRequestId(request);
  const authorized = await authorizeRunRead(request, requestId);
  if (!authorized.ok) return authorized.response;
  if (!RUN_ID_PATTERN.test(runId)) {
    return errorResponse(
      400,
      "invalid_request",
      "The run identifier is invalid.",
      requestId,
    );
  }

  const backend = deps.backend ?? getRunsBackend();
  if (backend.kind === "mock" && getRunsScenario().kind === "malformed") {
    return createRunEventStream(request, runId, [], requestId, {
      malformed: true,
      delayMs: 0,
    });
  }

  const url = new URL(request.url);
  const lastEventId =
    request.headers.get("last-event-id") ?? url.searchParams.get("cursor");
  if (lastEventId && !eventIdSchema.safeParse(lastEventId).success) {
    return errorResponse(
      400,
      "invalid_request",
      "The event cursor is invalid.",
      requestId,
    );
  }

  try {
    const result = await backend.getEvents(
      authorized.context,
      runId,
      lastEventId ?? undefined,
    );
    if (
      !result ||
      !authorize(authorized.context.principal, "run:view", {
        tenantId: result.tenantId,
      }).allowed
    ) {
      return runNotFound(requestId);
    }
    if (result.history === "cursor-expired" || result.history === "unavailable") {
      return createRunEventStream(request, runId, [], requestId, {
        recovery:
          result.history === "cursor-expired"
            ? "cursor-expired"
            : "history-unavailable",
        delayMs: 0,
      });
    }
    if (backend.kind === "mock" && consumeRunStreamDisconnect()) {
      return createRunEventStream(request, runId, [], requestId, {
        disconnect: true,
        delayMs: 0,
      });
    }
    const scenario = getRunsScenario();
    return createRunEventStream(request, runId, result.events, requestId, {
      delayMs: scenario.kind === "delayed" ? scenario.delayMs ?? 300 : 80,
      closeAfterEvents: result.closeAfterEvents,
    });
  } catch (error) {
    return backendFailure(error, requestId);
  }
}

function runNotFound(requestId: string) {
  return errorResponse(404, "not_found", "Run not found.", requestId);
}

function waitForStreamDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}

function createRunEventStream(
  request: Request,
  runId: string,
  events: readonly RunEvent[],
  requestId: string,
  options: {
    delayMs: number;
    malformed?: boolean;
    disconnect?: boolean;
    recovery?: "cursor-expired" | "history-unavailable";
    closeAfterEvents?: boolean;
  },
) {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (value: string) =>
        controller.enqueue(encoder.encode(value));
      try {
        enqueue("retry: 250\n\n");
        if (options.disconnect) {
          controller.close();
          return;
        }
        if (options.recovery) {
          enqueue(
            `event: run-recovery\ndata: ${JSON.stringify({
              runId,
              reason: options.recovery,
            })}\n\n`,
          );
          controller.close();
          return;
        }
        if (options.malformed) {
          enqueue('event: run-event\ndata: {"invalid":true}\n\n');
        } else {
          for (const event of events) {
            if (request.signal.aborted) break;
            enqueue(
              `id: ${event.id}\nevent: run-event\ndata: ${JSON.stringify(event)}\n\n`,
            );
            if (options.delayMs > 0) {
              await waitForStreamDelay(options.delayMs, request.signal);
            }
          }
        }
        if (options.closeAfterEvents) {
          controller.close();
          return;
        }
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        heartbeat = setInterval(() => {
          if (!request.signal.aborted) enqueue(": keepalive\n\n");
        }, 15_000);
      } catch (error) {
        if (request.signal.aborted) {
          controller.close();
          return;
        }
        logServerEvent("error", "runs-bff", "event_stream_failed", {
          requestId,
          errorCode: "stream_error",
        });
        controller.error(error);
      }
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  request.signal.addEventListener(
    "abort",
    () => {
      if (heartbeat) clearInterval(heartbeat);
    },
    { once: true },
  );

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-store, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
      "x-request-id": requestId,
    },
  });
}
