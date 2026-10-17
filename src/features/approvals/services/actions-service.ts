import { apiFetch } from "@/lib/api/client";
import { actionListResponseSchema, apiErrorResponseSchema } from "../contracts";
import type { ActionsService } from "../types";
import { serializeActionListQuery } from "../utils/action-list-query";
import { ActionsServiceError } from "./actions-service-error";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpActionsServiceOptions = {
  /** Origin prefix; empty string means same-origin relative URLs. */
  baseUrl?: string;
  fetchFn?: FetchFn;
};

function isAbortError(error: unknown): boolean {
  // Compared by name: DOMException identity differs across realms (e.g. jsdom).
  return error instanceof Error && error.name === "AbortError";
}

/**
 * HTTP adapter for `GET /api/actions` (proposed frontend contract).
 * The list payload is validated with the existing domain schema. The existing
 * contract has no separate DTO shape for actions, so no DTO-to-domain mapping
 * is needed here; if a DTO diverges later, map inside this adapter.
 */
export function createHttpActionsService(
  options: HttpActionsServiceOptions = {},
): ActionsService {
  const { baseUrl = "", fetchFn = apiFetch } = options;

  return {
    async listActions(query, { signal } = {}) {
      const queryString = serializeActionListQuery(query).toString();
      const url = `${baseUrl}/api/actions${queryString ? `?${queryString}` : ""}`;

      let response: Response;
      try {
        response = await fetchFn(url, {
          signal,
          headers: { accept: "application/json" },
        });
      } catch (error) {
        // Let TanStack Query see cancellations unchanged.
        if (isAbortError(error)) throw error;
        throw new ActionsServiceError(
          "network",
          "The server could not be reached. Check your connection and try again.",
        );
      }

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const parsedError = apiErrorResponseSchema.safeParse(body);
        const apiError = parsedError.success ? parsedError.data.error : undefined;
        throw new ActionsServiceError(
          "http",
          apiError?.message ?? `The server responded with status ${response.status}.`,
          {
            status: response.status,
            code: apiError?.code,
            requestId: apiError?.requestId,
          },
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        if (isAbortError(error)) throw error;
        throw new ActionsServiceError(
          "malformed",
          "The server returned a response that is not valid JSON.",
        );
      }

      const parsed = actionListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ActionsServiceError(
          "malformed",
          "The server returned actions in an unexpected format.",
        );
      }
      return parsed.data;
    },
  };
}
