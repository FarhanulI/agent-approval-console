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
} from "../schemas/run";
import type { RunEventHandlers, RunsService } from "../types";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpRunsServiceOptions = {
  baseUrl?: string;
  fetchFn?: FetchFn;
  createEventSource?: (url: string) => EventSource;
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
      return response.run;
    },

    subscribeEvents(runId, handlers: RunEventHandlers) {
      let source: EventSource;
      try {
        source = createEventSource(
          `${baseUrl}/api/runs/${encodeURIComponent(runId)}/events`,
        );
      } catch {
        handlers.onError("disconnected");
        return () => {};
      }

      source.onopen = () => handlers.onOpen();
      source.onerror = () => {
        handlers.onError(
          source.readyState === EventSource.CLOSED
            ? "disconnected"
            : "reconnecting",
        );
      };
      source.addEventListener("run-event", (message) => {
        let body: unknown;
        try {
          body = JSON.parse((message as MessageEvent<string>).data);
        } catch {
          handlers.onError("reconnecting");
          return;
        }
        const parsed = runEventSchema.safeParse(body);
        if (!parsed.success || parsed.data.runId !== runId) {
          handlers.onError("reconnecting");
          return;
        }
        handlers.onEvent(parsed.data);
      });

      return () => source.close();
    },
  };
}
