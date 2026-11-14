import type { z } from "zod";
import {
  apiErrorResponseSchema,
} from "@/features/approvals/contracts";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import { apiFetch } from "@/lib/api/client";
import {
  runDetailResponseSchema,
  runEventSchema,
  runListResponseSchema,
  runStreamRecoverySchema,
} from "../schemas/run";
import type { RunEventHandlers, RunsService } from "../types";
import { mergeRunEventHistory } from "../utils/run-events";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpRunsServiceOptions = {
  baseUrl?: string;
  fetchFn?: FetchFn;
  createEventSource?: (url: string) => EventSource;
  maxReconnectAttempts?: number;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function createHttpRunsService(
  options: HttpRunsServiceOptions = {},
): RunsService {
  const {
    baseUrl = "",
    fetchFn = apiFetch,
    createEventSource = (url) => new EventSource(url),
    maxReconnectAttempts = 5,
  } = options;

  async function getValidated<T>(
    url: string,
    signal: AbortSignal | undefined,
    schema: z.ZodType<T>,
    mapNotFound = false,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(url, {
        signal,
        headers: { accept: "application/json" },
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ActionsServiceError(
        "network",
        "The server could not be reached. Check your connection and try again.",
      );
    }

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const parsed = apiErrorResponseSchema.safeParse(body);
      const apiError = parsed.success ? parsed.data.error : undefined;
      throw new ActionsServiceError(
        mapNotFound && response.status === 404 ? "not-found" : "http",
        apiError?.message ?? `The server responded with status ${response.status}.`,
        {
          status: response.status,
          code: apiError?.code,
          requestId: apiError?.requestId,
        },
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ActionsServiceError(
        "malformed",
        "The server returned a response that is not valid JSON.",
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ActionsServiceError(
        "malformed",
        "The server returned run data in an unexpected format.",
      );
    }
    return parsed.data;
  }

  return {
    listRuns({ signal } = {}) {
      return getValidated(
        `${baseUrl}/api/runs`,
        signal,
        runListResponseSchema,
      );
    },

    async getRun(runId, { signal } = {}) {
      const response = await getValidated(
        `${baseUrl}/api/runs/${encodeURIComponent(runId)}`,
        signal,
        runDetailResponseSchema,
        true,
      );
      if (response.run.id !== runId) {
        throw new ActionsServiceError(
          "malformed",
          "The server returned a different run than the one requested.",
        );
      }
      return {
        ...response.run,
        events: mergeRunEventHistory([], response.run.events, runId),
      };
    },

    subscribeEvents(runId, handlers: RunEventHandlers, { lastEventId } = {}) {
      let source: EventSource;
      const cursor = lastEventId
        ? `?cursor=${encodeURIComponent(lastEventId)}`
        : "";
      try {
        source = createEventSource(
          `${baseUrl}/api/runs/${encodeURIComponent(runId)}/events${cursor}`,
        );
      } catch {
        handlers.onError("disconnected");
        return () => {};
      }

      let closed = false;
      let reconnectAttempts = 0;
      const close = () => {
        if (closed) return;
        closed = true;
        source.onopen = null;
        source.onerror = null;
        source.removeEventListener("run-event", onRunEvent);
        source.removeEventListener("run-recovery", onRunRecovery);
        source.close();
      };
      const onRunEvent: EventListener = (message) => {
        let body: unknown;
        try {
          body = JSON.parse((message as MessageEvent<string>).data);
        } catch {
          close();
          handlers.onError("disconnected");
          return;
        }
        const parsed = runEventSchema.safeParse(body);
        if (!parsed.success || parsed.data.runId !== runId) {
          close();
          handlers.onError("disconnected");
          return;
        }
        handlers.onEvent(parsed.data);
      };
      const onRunRecovery: EventListener = (message) => {
        let body: unknown;
        try {
          body = JSON.parse((message as MessageEvent<string>).data);
        } catch {
          close();
          handlers.onError("disconnected");
          return;
        }
        const parsed = runStreamRecoverySchema.safeParse(body);
        if (!parsed.success || parsed.data.runId !== runId) {
          close();
          handlers.onError("disconnected");
          return;
        }
        close();
        handlers.onRecovery(parsed.data);
      };

      source.onopen = () => {
        if (!closed) handlers.onOpen();
      };
      source.onerror = () => {
        if (closed) return;
        reconnectAttempts += 1;
        const disconnected =
          source.readyState === source.CLOSED ||
          reconnectAttempts >= maxReconnectAttempts;
        if (disconnected) close();
        handlers.onError(disconnected ? "disconnected" : "reconnecting");
      };
      source.addEventListener("run-event", onRunEvent);
      source.addEventListener("run-recovery", onRunRecovery);

      return close;
    },
  };
}
