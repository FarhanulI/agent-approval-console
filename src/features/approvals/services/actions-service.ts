import type { z } from "zod";
import { apiFetch } from "@/lib/api/client";
import {
  actionListResponseSchema,
  apiErrorResponseSchema,
  decisionResultSchema,
  pendingActionSchema,
} from "../contracts";
import {
  browserDecisionRequestSchema,
  isProposedConflictCode,
} from "../schemas/decision-request";
import type { ActionsService } from "../types";
import { serializeActionListQuery } from "../utils/action-list-query";
import { ActionsServiceError } from "./actions-service-error";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type HttpActionsServiceOptions = {
  /** Origin prefix; empty string means same-origin relative URLs. */
  baseUrl?: string;
  fetchFn?: FetchFn;
  /**
   * UX hint only: whether the UI offers decisions. Defaults to true only when
   * the public build flag `NEXT_PUBLIC_API_MOCKING=enabled` is set. It is NOT a
   * security control: the server BFF independently refuses decisions
   * (`503 decisions_unavailable`) unless a backend is configured, and checks
   * the session, role, tenant, status and version on every request.
   */
  decisionsEnabled?: boolean;
  /** Client-side timeout for a decision request. A timeout is an unknown outcome. */
  decisionTimeoutMs?: number;
};

const DEFAULT_DECISION_TIMEOUT_MS = 15_000;

function isAbortError(error: unknown): boolean {
  // Compared by name: DOMException identity differs across realms (e.g. jsdom).
  return error instanceof Error && error.name === "AbortError";
}

/** Reads and validates the API error envelope; undefined if absent/invalid. */
async function readApiError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  const parsed = apiErrorResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.error : undefined;
}

function httpDetails(
  response: Response,
  apiError: Awaited<ReturnType<typeof readApiError>>,
) {
  return {
    status: response.status,
    code: apiError?.code,
    requestId: apiError?.requestId,
  };
}

/**
 * HTTP adapter for the actions API. All three operations are PROPOSED frontend
 * contracts (`GET /api/actions`, `GET /api/actions/:id`,
 * `POST /api/actions/:id/approve|reject`); they are implemented by MSW only and
 * have NOT been verified against `erp-mcp-bridge`.
 *
 * Payloads are validated with the existing domain schemas. The existing
 * contract has no separate DTO shape for actions, so no DTO-to-domain mapping
 * is needed; if a DTO diverges later, map inside this adapter.
 */
export function createHttpActionsService(
  options: HttpActionsServiceOptions = {},
): ActionsService {
  const {
    baseUrl = "",
    fetchFn = apiFetch,
    decisionsEnabled = process.env.NEXT_PUBLIC_API_MOCKING === "enabled",
    decisionTimeoutMs = DEFAULT_DECISION_TIMEOUT_MS,
  } = options;

  /**
   * Shared GET pipeline: transport, HTTP status, JSON and schema validation.
   * Aborts are rethrown unchanged so TanStack Query can recognise them.
   */
  async function getValidated<T>(
    url: string,
    signal: AbortSignal | undefined,
    schema: z.ZodType<T>,
    unexpectedFormatMessage: string,
    { mapNotFound }: { mapNotFound: boolean },
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
      const apiError = await readApiError(response);
      throw new ActionsServiceError(
        mapNotFound && response.status === 404 ? "not-found" : "http",
        apiError?.message ?? `The server responded with status ${response.status}.`,
        httpDetails(response, apiError),
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

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ActionsServiceError("malformed", unexpectedFormatMessage);
    }
    return parsed.data;
  }

  return {
    decisionsEnabled,

    /**
     * `GET /api/actions` (proposed). Validates the page with
     * `actionListResponseSchema`.
     * @throws {ActionsServiceError} `network`, `http` or `malformed`.
     * @throws AbortError unchanged when `signal` aborts.
     */
    listActions(query, { signal } = {}) {
      const queryString = serializeActionListQuery(query).toString();
      const url = `${baseUrl}/api/actions${queryString ? `?${queryString}` : ""}`;
      return getValidated(
        url,
        signal,
        actionListResponseSchema,
        "The server returned actions in an unexpected format.",
        { mapNotFound: false },
      );
    },

    /**
     * `GET /api/actions/:id` (proposed). The id is URL-encoded. The response
     * must validate as `PendingAction` and carry the requested id; a payload
     * for a different action is treated as malformed rather than shown.
     * @throws {ActionsServiceError} `not-found` (404), `http`, `network`, `malformed`.
     * @throws AbortError unchanged when `signal` aborts.
     */
    async getAction(actionId, { signal } = {}) {
      const action = await getValidated(
        `${baseUrl}/api/actions/${encodeURIComponent(actionId)}`,
        signal,
        pendingActionSchema,
        "The server returned the action in an unexpected format.",
        { mapNotFound: true },
      );
      if (action.id !== actionId) {
        throw new ActionsServiceError(
          "malformed",
          "The server returned a different action than the one requested.",
        );
      }
      return action;
    },

    /**
     * `POST /api/actions/:id/approve|reject` (proposed, MSW-only). Sends the
     * browser DTO without any actor identity; the server-side boundary is
     * responsible for deriving the actor. Never retries.
     *
     * Outcome classification (frontend policy, not a backend guarantee):
     * - definite rejection: 4xx (`not-found`, `conflict` only for a proposed
     *   409 code, otherwise `http`);
     * - `unknown-outcome`: transport failure/timeout, 5xx, or a 2xx whose body
     *   is unreadable or does not match the request. The server may have
     *   committed the decision; callers must reconcile with `getAction`.
     *
     * @throws {ActionsServiceError} `unavailable` (nothing sent), `not-found`,
     *   `conflict`, `http`, `unknown-outcome`.
     * @throws ZodError if `input` violates the browser DTO (programmer error).
     */
    async decideAction(input) {
      if (!decisionsEnabled) {
        throw new ActionsServiceError(
          "unavailable",
          "Decisions are unavailable: no trusted identity and authorization boundary is configured for this environment.",
        );
      }

      const { actionId, idempotencyKey, ...rest } = input;
      const body = browserDecisionRequestSchema.parse(rest);
      const url = `${baseUrl}/api/actions/${encodeURIComponent(actionId)}/${body.decision}`;

      let response: Response;
      try {
        response = await fetchFn(url, {
          method: "POST",
          signal: AbortSignal.timeout(decisionTimeoutMs),
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            // Callers that may resubmit the same logical decision must pass
            // the same key; a fresh key is generated only for one-shot calls.
            "idempotency-key": idempotencyKey ?? crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new ActionsServiceError(
          "unknown-outcome",
          "The connection failed or timed out. The decision may or may not have been recorded.",
        );
      }

      if (!response.ok) {
        const apiError = await readApiError(response);
        const details = httpDetails(response, apiError);
        const message =
          apiError?.message ?? `The server responded with status ${response.status}.`;
        // The BFF has no verified backend: nothing was sent, so this is NOT an unknown outcome.
        if (response.status === 503 && apiError?.code === "decisions_unavailable") {
          throw new ActionsServiceError("unavailable", message, details);
        }
        if (response.status >= 500) {
          throw new ActionsServiceError(
            "unknown-outcome",
            "The server reported an error. The decision may or may not have been recorded.",
            details,
          );
        }
        if (response.status === 404) {
          throw new ActionsServiceError("not-found", message, details);
        }
        if (response.status === 409 && isProposedConflictCode(apiError?.code)) {
          throw new ActionsServiceError("conflict", message, details);
        }
        throw new ActionsServiceError("http", message, details);
      }

      const payload: unknown = await response.json().catch(() => null);
      const parsed = decisionResultSchema.safeParse(payload);
      if (
        !parsed.success ||
        parsed.data.actionId !== actionId ||
        parsed.data.decision !== body.decision
      ) {
        throw new ActionsServiceError(
          "unknown-outcome",
          "The server answered, but the response could not be confirmed as the result of this decision.",
        );
      }
      return parsed.data;
    },
  };
}
