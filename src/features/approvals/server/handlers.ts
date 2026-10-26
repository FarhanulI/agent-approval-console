import { actionDecisionRequestSchema, decisionResultSchema } from "@/features/approvals/contracts";
import { authorize } from "@/lib/auth/policy";
import { resolvePrincipal } from "@/lib/auth/principal";
import {
  errorResponse,
  forbidden,
  getRequestId,
  hasTrustedOrigin,
  jsonResponse,
  notFound,
  unauthenticated,
} from "@/lib/server/http";
import { parseActionListQuery } from "../schemas/action-list-query";
import { browserDecisionRequestSchema } from "../schemas/decision-request";
import { BackendError, type ActionsBackend, type BackendContext } from "./actions-backend";
import { getBackend } from "./get-backend";

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_BODY_BYTES = 8 * 1024;

type Deps = { backend?: ActionsBackend };

/** Security-relevant events only; never bodies, cookies or tokens. */
function logSecurityEvent(event: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test") return;
  console.info(JSON.stringify({ scope: "approvals-bff", ...event }));
}

/** Maps backend failures to sanitized errors. `decision` preserves uncertainty. */
function backendFailure(error: unknown, requestId: string, decision: boolean) {
  if (error instanceof BackendError) {
    if (error.kind === "unavailable") {
      return decision
        ? errorResponse(
            503,
            "decisions_unavailable",
            "Decisions are unavailable: no verified backend contract is configured. Nothing was sent.",
            requestId,
          )
        : errorResponse(
            503,
            "backend_unavailable",
            "The approvals backend is not available in this environment.",
            requestId,
          );
    }
    if (decision) {
      return errorResponse(
        error.kind === "timeout" ? 504 : 502,
        "decision_outcome_unknown",
        "The backend did not confirm the decision. It may or may not have been recorded.",
        requestId,
      );
    }
    return errorResponse(
      error.kind === "timeout" ? 504 : 502,
      "bad_gateway",
      "The approvals backend could not complete the request.",
      requestId,
    );
  }
  return errorResponse(500, "internal_error", "An unexpected error occurred.", requestId);
}

/**
 * `GET /api/actions` BFF. Authentication (401) and `action:view` (403) are
 * checked here regardless of the proxy. The backend is responsible for
 * returning only the principal's tenants; the BFF additionally fails closed
 * (502) if a returned record is outside them.
 */
export async function handleListActions(request: Request, deps: Deps = {}) {
  const requestId = getRequestId(request);
  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) return unauthenticated(requestId);
  const { principal } = auth;
  if (!authorize(principal, "action:view").allowed) return forbidden(requestId);

  const parsed = parseActionListQuery(new URL(request.url).searchParams);
  if (!parsed.success) {
    return errorResponse(400, "invalid_query", "One or more query parameters are invalid.", requestId, {
      fields: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
  }

  const ctx: BackendContext = { requestId, principal };
  try {
    const result = await (deps.backend ?? getBackend()).listActions(ctx, parsed.data);
    const leaked = result.items.some(
      (item) => !authorize(principal, "action:view", { tenantId: item.targetRecord.tenantId }).allowed,
    );
    if (leaked) {
      logSecurityEvent({ event: "list_tenant_leak_blocked", requestId, userId: principal.userId });
      return errorResponse(502, "bad_gateway", "The approvals backend could not complete the request.", requestId);
    }
    return jsonResponse(result, requestId);
  } catch (error) {
    return backendFailure(error, requestId, false);
  }
}

/**
 * `GET /api/actions/:id` BFF. A missing action and an action in another tenant
 * produce the same 404 so existence is not revealed across tenants.
 */
export async function handleGetAction(request: Request, actionId: string, deps: Deps = {}) {
  const requestId = getRequestId(request);
  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) return unauthenticated(requestId);
  const { principal } = auth;
  if (!authorize(principal, "action:view").allowed) return forbidden(requestId);
  if (!ACTION_ID_PATTERN.test(actionId)) {
    return errorResponse(400, "invalid_request", "The action identifier is invalid.", requestId);
  }

  try {
    const action = await (deps.backend ?? getBackend()).getAction({ requestId, principal }, actionId);
    if (
      !action ||
      !authorize(principal, "action:view", { tenantId: action.targetRecord.tenantId }).allowed
    ) {
      return notFound(requestId);
    }
    return jsonResponse(action, requestId);
  } catch (error) {
    return backendFailure(error, requestId, false);
  }
}

/**
 * `POST /api/actions/:id/approve|reject` BFF: the trusted decision boundary.
 *
 * Order matters: origin (CSRF) → session (401) → role permission (403, before
 * touching any resource) → content type/idempotency key/strict body (400/415;
 * `actorId`, roles or tenant claims in the body are rejected, never read) →
 * load action → tenant check (404, same as missing) → idempotent replay →
 * status and `recordVersion` pre-check (409) → backend command whose `actorId`
 * is the session user.
 *
 * The status/version pre-check is a courtesy for fast, clear errors; it is not
 * atomic. The backend must repeat it atomically (verified only for the mock).
 * `Idempotency-Key` is forwarded and scoped to user+tenant+action+decision; it
 * only prevents duplicate effects if the backend honors it (unverified for
 * `erp-mcp-bridge`). It is independent of `recordVersion` concurrency control.
 * A timeout/5xx from the backend is reported as an UNKNOWN outcome.
 */
export async function handleDecision(
  request: Request,
  actionId: string,
  decision: "approve" | "reject",
  deps: Deps = {},
) {
  const requestId = getRequestId(request);

  if (!hasTrustedOrigin(request)) {
    logSecurityEvent({ event: "decision_denied", reason: "origin", requestId });
    return errorResponse(403, "invalid_origin", "The request origin is not allowed.", requestId);
  }

  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) return unauthenticated(requestId);
  const { principal } = auth;

  const permission = `action:${decision}` as const;
  if (!authorize(principal, permission).allowed) {
    logSecurityEvent({ event: "decision_denied", reason: "permission", requestId, userId: principal.userId, actionId });
    return forbidden(requestId);
  }

  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "unsupported_media_type", "The request must be application/json.", requestId);
  }
  if (!ACTION_ID_PATTERN.test(actionId)) {
    return errorResponse(400, "invalid_request", "The action identifier is invalid.", requestId);
  }
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return errorResponse(400, "invalid_idempotency_key", "A valid Idempotency-Key header is required.", requestId);
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return errorResponse(413, "payload_too_large", "The request body is too large.", requestId);
  }
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // handled by schema validation below
  }
  const parsed = browserDecisionRequestSchema.safeParse(json);
  if (!parsed.success || parsed.data.decision !== decision) {
    return errorResponse(400, "invalid_request", "The decision request is invalid.", requestId, {
      fields: parsed.success
        ? ["decision"]
        : parsed.error.issues.map((issue) => issue.path.join(".") || "(body)"),
    });
  }
  const body = parsed.data;

  const backend = deps.backend ?? getBackend();
  const ctx: BackendContext = { requestId, principal };

  try {
    const action = await backend.getAction(ctx, actionId);
    const tenantId = action?.targetRecord.tenantId;
    const decisionAuth = authorize(principal, permission, { tenantId });
    if (!action || !decisionAuth.allowed) {
      if (action && !decisionAuth.allowed && decisionAuth.reason === "permission") {
        return forbidden(requestId);
      }
      logSecurityEvent({ event: "decision_denied", reason: "tenant_or_missing", requestId, userId: principal.userId, actionId });
      return notFound(requestId);
    }
    if (tenantId === undefined) return notFound(requestId);

    const scope = `${principal.userId}|${tenantId}|${actionId}|${decision}|${idempotencyKey}`;
    const fingerprint = JSON.stringify([decision, body.recordVersion, body.reason ?? ""]);
    const recorded = await backend.findRecordedDecision(ctx, scope, fingerprint);
    if (recorded.kind === "key-reuse") {
      return errorResponse(422, "idempotency_key_reuse", "This Idempotency-Key was used for a different request.", requestId);
    }
    if (recorded.kind === "replay") {
      return jsonResponse(
        {
          actionId,
          decision,
          status: recorded.result.status,
          recordVersion: recorded.result.recordVersion,
          message: "This decision was already recorded; returning the original result.",
        },
        requestId,
        { headers: { "idempotency-replayed": "true" } },
      );
    }

    if (action.status !== "pending") {
      return errorResponse(409, "invalid_transition", "The action cannot take this decision in its current state.", requestId);
    }
    if (action.recordVersion !== body.recordVersion) {
      return errorResponse(409, "version_conflict", "The action changed since it was loaded.", requestId);
    }

    // Actor comes from the session only; the browser DTO has no actor field.
    const command = actionDecisionRequestSchema.parse({
      decision,
      reason: body.reason,
      recordVersion: body.recordVersion,
      actorId: principal.userId,
    });
    const outcome = await backend.decide(ctx, { command, actionId, tenantId, idempotencyKey });

    if (outcome.kind === "rejected") {
      logSecurityEvent({ event: "decision_rejected", code: outcome.code, requestId, userId: principal.userId, actionId });
      switch (outcome.code) {
        case "not_found":
          return notFound(requestId);
        case "forbidden":
          return forbidden(requestId);
        case "version_conflict":
          return errorResponse(409, "version_conflict", "The action changed since it was loaded.", requestId);
        default:
          return errorResponse(409, "invalid_transition", "The action cannot take this decision in its current state.", requestId);
      }
    }

    const checked = decisionResultSchema.safeParse(outcome.result);
    if (!checked.success) {
      return errorResponse(502, "decision_outcome_unknown", "The backend did not confirm the decision. It may or may not have been recorded.", requestId);
    }
    const result = checked.data;
    logSecurityEvent({ event: "decision_recorded", requestId, userId: principal.userId, actionId, decision });
    return jsonResponse(result, requestId);
  } catch (error) {
    logSecurityEvent({ event: "decision_error", requestId, userId: principal.userId, actionId });
    return backendFailure(error, requestId, true);
  }
}
