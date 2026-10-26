import type { z } from "zod";
import { apiErrorResponseSchema } from "@/features/approvals/contracts";
import { ActionsServiceError } from "@/features/approvals/services/actions-service-error";
import { apiFetch } from "@/lib/api/client";
import {
  auditEventDtoSchema,
  auditEventListResponseDtoSchema,
} from "../schemas/audit-event";
import { serializeAuditEventQuery } from "../schemas/audit-query";
import type { AuditService } from "../types";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpAuditServiceOptions = { baseUrl?: string; fetchFn?: FetchFn };

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * HTTP adapter for the PROPOSED audit endpoints (`GET /api/audit-events`,
 * `GET /api/audit-events/:id`), served by the server-side BFF. Responses are
 * validated with Zod; failures reuse `ActionsServiceError` (`network`, `http`,
 * `malformed`, `not-found`) so the UI error handling stays uniform. Reads are
 * never retried here. Whether `erp-mcp-bridge` provides audit data is unknown.
 */
export function createHttpAuditService(options: HttpAuditServiceOptions = {}): AuditService {
  const { baseUrl = "", fetchFn = apiFetch } = options;

  async function getValidated<T>(
    url: string,
    signal: AbortSignal | undefined,
    schema: z.ZodType<T>,
    mapNotFound: boolean,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetchFn(url, { signal, headers: { accept: "application/json" } });
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
        { status: response.status, code: apiError?.code, requestId: apiError?.requestId },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw new ActionsServiceError("malformed", "The server returned a response that is not valid JSON.");
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ActionsServiceError("malformed", "The server returned audit data in an unexpected format.");
    }
    return parsed.data;
  }

  return {
    listEvents(query, { signal } = {}) {
      const queryString = serializeAuditEventQuery(query).toString();
      return getValidated(
        `${baseUrl}/api/audit-events${queryString ? `?${queryString}` : ""}`,
        signal,
        auditEventListResponseDtoSchema,
        false,
      );
    },

    async getEvent(eventId, { signal } = {}) {
      const event = await getValidated(
        `${baseUrl}/api/audit-events/${encodeURIComponent(eventId)}`,
        signal,
        auditEventDtoSchema,
        true,
      );
      if (event.id !== eventId) {
        throw new ActionsServiceError("malformed", "The server returned a different event than requested.");
      }
      return event;
    },
  };
}
