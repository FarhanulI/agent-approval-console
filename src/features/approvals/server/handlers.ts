import {
  actionDecisionRequestSchema,
  decisionResultSchema,
} from "@/features/approvals/contracts";
import { authorize } from "@/lib/auth/policy";
import { resolvePrincipal } from "@/lib/auth/principal";
import {
  errorResponse,
  forbidden,
  getRequestId,
  hasTrustedOrigin,
  jsonResponse,
  notFound,
  readBoundedBody,
  tooManyRequests,
  unauthenticated,
} from "@/lib/server/http";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { logServerEvent } from "@/lib/server/logger";
import { parseActionListQuery } from "../schemas/action-list-query";
import type {
  AuditDetails,
  AuditEventType,
  AuditOutcome,
} from "@/features/audit/schemas/audit-event";
import type { AuditBackend } from "@/features/audit/server/audit-backend";
import { getAuditBackend } from "@/features/audit/server/get-audit-backend";
import { recordAuditEvent } from "@/features/audit/server/handlers";
import { getRunsBackend } from "@/features/runs/server/get-runs-backend";
import type { RunsBackend } from "@/features/runs/server/runs-backend";
import { browserDecisionRequestSchema } from "../schemas/decision-request";
import {
  bulkDecisionRequestSchema,
  bulkDecisionResultSchema,
  type BulkDecisionItemResult,
} from "../schemas/bulk-decision";
import {
  BackendError,
  type ActionsBackend,
  type BackendContext,
  type BulkDecideCommand,
} from "./actions-backend";
import { getBackend } from "./get-backend";

const ACTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_BULK_BODY_BYTES = 24 * 1024;

type Deps = { backend?: ActionsBackend; audit?: AuditBackend; runs?: RunsBackend };

async function resolveAuditRunId(
  action: { id: string; runId?: string },
  tenantId: string,
  ctx: BackendContext,
  runs: RunsBackend,
): Promise<string | null | undefined> {
  if (action.runId === undefined) return null;
  if (
    !/^[A-Za-z0-9_-]{1,64}$/.test(action.runId) ||
    !authorize(ctx.principal, "run:view", { tenantId }).allowed
  ) {
    return undefined;
  }

  try {
    const stored = await runs.get(ctx, action.runId);
    if (
      stored?.detail.id === action.runId &&
      stored.tenantId === tenantId &&
      stored.detail.actionIds.includes(action.id)
    ) {
      return action.runId;
    }
  } catch (error) {
    logServerEvent("warn", "approvals-bff", "audit_run_relationship_unavailable", {
      requestId: ctx.requestId,
      errorCode: error instanceof BackendError ? error.kind : "run_lookup_failed",
    });
    return undefined;
  }

  logServerEvent("warn", "approvals-bff", "audit_run_relationship_unavailable", {
    requestId: ctx.requestId,
    errorCode: "run_reference_unavailable",
  });
  return undefined;
}

async function hasValidActionRunReference(
  action: { id: string; runId?: string },
  tenantId: string,
  ctx: BackendContext,
  runs: RunsBackend,
): Promise<boolean> {
  if (action.runId === undefined) return true;
  if (!authorize(ctx.principal, "run:view", { tenantId }).allowed) return false;
  return (await resolveAuditRunId(action, tenantId, ctx, runs)) === action.runId;
}

/** Maps backend failures to sanitized errors. `decision` preserves uncertainty. */
function backendFailure(error: unknown, requestId: string, decision: boolean) {
  if (error instanceof BackendError) {
    logServerEvent("warn", "approvals-bff", "backend_request_failed", {
      requestId,
      errorCode: error.kind,
    });
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
    logServerEvent("error", "approvals-bff", "unexpected_backend_error", {
      requestId,
      errorCode: "internal_error",
    });
    return errorResponse(
      error.kind === "timeout" ? 504 : 502,
      "bad_gateway",
      "The approvals backend could not complete the request.",
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
    return errorResponse(
      400,
      "invalid_query",
      "One or more query parameters are invalid.",
      requestId,
      {
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      },
    );
  }

  const ctx: BackendContext = { requestId, principal };
  try {
    const result = await (deps.backend ?? getBackend()).listActions(
      ctx,
      parsed.data,
    );
    const runs = deps.runs ?? getRunsBackend();
    const leaked = result.items.some(
      (item) =>
        !authorize(principal, "action:view", {
          tenantId: item.targetRecord.tenantId,
        }).allowed,
    );
    if (leaked) {
      logServerEvent("error", "approvals-bff", "tenant_leak_blocked", {
        requestId,
        userId: principal.userId,
        errorCode: "tenant_scope_violation",
      });
      return errorResponse(
        502,
        "bad_gateway",
        "The approvals backend could not complete the request.",
        requestId,
      );
    }
    for (const action of result.items) {
      const tenantId = action.targetRecord.tenantId;
      if (!tenantId) {
        return errorResponse(
          502,
          "bad_gateway",
          "The approvals backend could not complete the request.",
          requestId,
        );
      }
      if (
        action.runId !== undefined &&
        !authorize(principal, "run:view", {
          tenantId,
        }).allowed
      ) {
        return forbidden(requestId);
      }
      if (
        !(await hasValidActionRunReference(
          action,
          tenantId,
          ctx,
          runs,
        ))
      ) {
        return errorResponse(
          502,
          "bad_gateway",
          "The approvals backend could not complete the request.",
          requestId,
        );
      }
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
export async function handleGetAction(
  request: Request,
  actionId: string,
  deps: Deps = {},
) {
  const requestId = getRequestId(request);
  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) return unauthenticated(requestId);
  const { principal } = auth;
  if (!authorize(principal, "action:view").allowed) return forbidden(requestId);
  if (!ACTION_ID_PATTERN.test(actionId)) {
    return errorResponse(
      400,
      "invalid_request",
      "The action identifier is invalid.",
      requestId,
    );
  }

  try {
    const runs = deps.runs ?? getRunsBackend();
    const action = await (deps.backend ?? getBackend()).getAction(
      { requestId, principal },
      actionId,
    );
    const tenantId = action?.targetRecord.tenantId;
    if (
      !action ||
      !tenantId ||
      !authorize(principal, "action:view", {
        tenantId,
      }).allowed
    ) {
      return notFound(requestId);
    }
    if (
      action.runId !== undefined &&
      !authorize(principal, "run:view", { tenantId }).allowed
    ) {
      return forbidden(requestId);
    }
    if (
      !(await hasValidActionRunReference(
        action,
        tenantId,
        { requestId, principal },
        runs,
      ))
    ) {
      return errorResponse(
        502,
        "bad_gateway",
        "The approvals backend could not complete the request.",
        requestId,
      );
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
    logServerEvent("warn", "approvals-bff", "decision_denied", {
      requestId,
      reason: "origin",
    });
    return errorResponse(
      403,
      "invalid_origin",
      "The request origin is not allowed.",
      requestId,
    );
  }

  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) return unauthenticated(requestId);
  const { principal } = auth;

  const permission = `action:${decision}` as const;
  const backend = deps.backend ?? getBackend();
  const audit = deps.audit ?? getAuditBackend();
  const runs = deps.runs ?? getRunsBackend();
  const ctx: BackendContext = { requestId, principal };
  let auditRunId: string | null | undefined;
  const audit_ = (
    tenantId: string,
    eventType: AuditEventType,
    outcome: AuditOutcome,
    summary: string,
    details?: AuditDetails,
  ) =>
    recordAuditEvent(audit, ctx, {
      tenantId,
      eventType,
      outcome,
      summary,
      details,
      actorType: "user",
      actorId: principal.userId,
      actionId,
      runId: auditRunId,
      requestId,
    });

  if (!authorize(principal, permission).allowed) {
    logServerEvent("warn", "approvals-bff", "decision_denied", {
      reason: "permission",
      requestId,
      userId: principal.userId,
      resourceId: actionId,
    });
    // Audit only when the action is in one of the user's own tenants: recording
    // attempts on other tenants' actions would expose them across tenants.
    const target = await backend
      .getAction(ctx, actionId)
      .catch(() => undefined);
    const targetTenant = target?.targetRecord.tenantId;
    if (targetTenant && principal.tenantIds.includes(targetTenant)) {
      auditRunId = target
        ? await resolveAuditRunId(target, targetTenant, ctx, runs)
        : undefined;
      await audit_(
        targetTenant,
        "decision.denied",
        "rejected",
        "Decision denied: the user lacks permission to decide actions.",
        { decision },
      );
    }
    return forbidden(requestId);
  }

  const rateLimit = consumeRateLimit(`decision:${principal.userId}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    logServerEvent("warn", "approvals-bff", "decision_rate_limited", {
      requestId,
      userId: principal.userId,
      errorCode: "rate_limited",
    });
    return tooManyRequests(requestId, rateLimit.retryAfterSeconds);
  }

  if (
    !(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("application/json")
  ) {
    return errorResponse(
      415,
      "unsupported_media_type",
      "The request must be application/json.",
      requestId,
    );
  }
  if (!ACTION_ID_PATTERN.test(actionId)) {
    return errorResponse(
      400,
      "invalid_request",
      "The action identifier is invalid.",
      requestId,
    );
  }
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return errorResponse(
      400,
      "invalid_idempotency_key",
      "A valid Idempotency-Key header is required.",
      requestId,
    );
  }

  const boundedBody = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!boundedBody.ok && boundedBody.reason === "too_large") {
    return errorResponse(
      413,
      "payload_too_large",
      "The request body is too large.",
      requestId,
    );
  }
  if (!boundedBody.ok) {
    return errorResponse(
      400,
      "invalid_request",
      "The decision request is invalid.",
      requestId,
    );
  }
  let json: unknown = null;
  try {
    json = JSON.parse(boundedBody.text);
  } catch {
    // handled by schema validation below
  }
  const parsed = browserDecisionRequestSchema.safeParse(json);
  if (!parsed.success || parsed.data.decision !== decision) {
    return errorResponse(
      400,
      "invalid_request",
      "The decision request is invalid.",
      requestId,
      {
        fields: parsed.success
          ? ["decision"]
          : parsed.error.issues.map(
              (issue) => issue.path.join(".") || "(body)",
            ),
      },
    );
  }
  const body = parsed.data;

  let knownTenant: string | undefined;
  try {
    const action = await backend.getAction(ctx, actionId);
    const tenantId = action?.targetRecord.tenantId;
    const decisionAuth = authorize(principal, permission, { tenantId });
    if (!action || !decisionAuth.allowed) {
      if (
        action &&
        !decisionAuth.allowed &&
        decisionAuth.reason === "permission"
      ) {
        return forbidden(requestId);
      }
      logServerEvent("warn", "approvals-bff", "decision_denied", {
        reason: "tenant_or_missing",
        requestId,
        userId: principal.userId,
        resourceId: actionId,
      });
      return notFound(requestId);
    }
    if (tenantId === undefined) return notFound(requestId);
    knownTenant = tenantId;
    auditRunId = await resolveAuditRunId(action, tenantId, ctx, runs);

    const scope = `${principal.userId}|${idempotencyKey}`;
    const fingerprint = JSON.stringify([
      tenantId,
      actionId,
      decision,
      body.recordVersion,
      body.reason ?? "",
    ]);
    const recorded = await backend.findRecordedDecision(
      ctx,
      scope,
      fingerprint,
    );
    if (recorded.kind === "key-reuse") {
      return errorResponse(
        422,
        "idempotency_key_reuse",
        "This Idempotency-Key was used for a different request.",
        requestId,
      );
    }
    if (recorded.kind === "replay") {
      return jsonResponse(
        {
          actionId,
          decision,
          status: recorded.result.status,
          recordVersion: recorded.result.recordVersion,
          message:
            "This decision was already recorded; returning the original result.",
        },
        requestId,
        { headers: { "idempotency-replayed": "true" } },
      );
    }

    if (action.status !== "pending") {
      await audit_(
        tenantId,
        "decision.conflict",
        "rejected",
        "Decision rejected: the action cannot take this decision in its current state.",
        {
          decision,
          recordVersion: body.recordVersion,
          conflictCode: "invalid_transition",
        },
      );
      return errorResponse(
        409,
        "invalid_transition",
        "The action cannot take this decision in its current state.",
        requestId,
      );
    }
    if (action.recordVersion !== body.recordVersion) {
      await audit_(
        tenantId,
        "decision.conflict",
        "rejected",
        "Decision rejected: the action changed after it was loaded.",
        {
          decision,
          recordVersion: body.recordVersion,
          conflictCode: "version_conflict",
        },
      );
      return errorResponse(
        409,
        "version_conflict",
        "The action changed since it was loaded.",
        requestId,
      );
    }

    // Actor comes from the session only; the browser DTO has no actor field.
    const command = actionDecisionRequestSchema.parse({
      decision,
      reason: body.reason,
      recordVersion: body.recordVersion,
      actorId: principal.userId,
    });
    const outcome = await backend.decide(ctx, {
      command,
      actionId,
      tenantId,
      idempotencyKey,
    });

    if (outcome.kind === "rejected") {
      logServerEvent("warn", "approvals-bff", "decision_rejected", {
        errorCode: outcome.code,
        requestId,
        userId: principal.userId,
        resourceId: actionId,
        decision,
      });
      switch (outcome.code) {
        case "not_found":
          return notFound(requestId);
        case "forbidden":
          await audit_(
            tenantId,
            "decision.denied",
            "rejected",
            "Decision denied by the backend: the user is not permitted to decide this action.",
            { decision },
          );
          return forbidden(requestId);
        case "idempotency_key_reuse":
          return errorResponse(
            422,
            "idempotency_key_reuse",
            "This Idempotency-Key was used for a different request.",
            requestId,
          );
        case "version_conflict":
          await audit_(
            tenantId,
            "decision.conflict",
            "rejected",
            "Decision rejected: the action changed after it was loaded.",
            {
              decision,
              recordVersion: body.recordVersion,
              conflictCode: "version_conflict",
            },
          );
          return errorResponse(
            409,
            "version_conflict",
            "The action changed since it was loaded.",
            requestId,
          );
        default:
          await audit_(
            tenantId,
            "decision.conflict",
            "rejected",
            "Decision rejected: the action cannot take this decision in its current state.",
            {
              decision,
              recordVersion: body.recordVersion,
              conflictCode: "invalid_transition",
            },
          );
          return errorResponse(
            409,
            "invalid_transition",
            "The action cannot take this decision in its current state.",
            requestId,
          );
      }
    }

    const checked = decisionResultSchema.safeParse(outcome.result);
    if (!checked.success) {
      await audit_(
        tenantId,
        "decision.outcome_unknown",
        "unknown",
        "The decision outcome could not be confirmed; it may or may not have been recorded.",
        { decision, recordVersion: body.recordVersion },
      );
      return errorResponse(
        502,
        "decision_outcome_unknown",
        "The backend did not confirm the decision. It may or may not have been recorded.",
        requestId,
      );
    }
    const result = checked.data;
    if (
      result.actionId !== actionId ||
      result.decision !== decision ||
      result.status !== (decision === "approve" ? "approved" : "rejected")
    ) {
      await audit_(
        tenantId,
        "decision.outcome_unknown",
        "unknown",
        "The decision outcome could not be confirmed; it may or may not have been recorded.",
        { decision, recordVersion: body.recordVersion },
      );
      return errorResponse(
        502,
        "decision_outcome_unknown",
        "The backend did not confirm the decision. It may or may not have been recorded.",
        requestId,
      );
    }
    if (outcome.kind === "replayed") {
      return jsonResponse(result, requestId, {
        headers: { "idempotency-replayed": "true" },
      });
    }
    // "Accepted" is not "executed": execution is a separate state this console never claims.
    await audit_(
      tenantId,
      "decision.accepted",
      "success",
      decision === "approve"
        ? "Approval accepted by the backend. Execution has not been performed."
        : "Rejection accepted by the backend.",
      {
        decision,
        recordVersion: body.recordVersion,
        reasonProvided: Boolean(body.reason?.trim()),
        resultingStatus: result.status,
      },
    );
    logServerEvent("info", "approvals-bff", "decision_recorded", {
      requestId,
      userId: principal.userId,
      resourceId: actionId,
      decision,
    });
    return jsonResponse(result, requestId);
  } catch (error) {
    if (
      knownTenant &&
      error instanceof BackendError &&
      error.kind !== "unavailable"
    ) {
      await audit_(
        knownTenant,
        "decision.outcome_unknown",
        "unknown",
        "The decision outcome could not be confirmed; it may or may not have been recorded.",
        { decision, recordVersion: body.recordVersion },
      );
    }
    return backendFailure(error, requestId, true);
  }
}

    /**
     * `POST /api/actions/bulk-decision` is a proposed BFF-only mock workflow.
     * Authentication is shared by the request, while tenant, permission, status,
     * version and idempotency are checked independently for every item. The
     * backend operation is per-item and is not an all-or-nothing transaction.
     */
    export async function handleBulkDecision(
      request: Request,
      deps: Deps = {},
    ) {
      const requestId = getRequestId(request);
      if (!hasTrustedOrigin(request)) {
        return errorResponse(
          403,
          "invalid_origin",
          "The request origin is not allowed.",
          requestId,
        );
      }

      const auth = await resolvePrincipal(request);
      if (!auth.authenticated) return unauthenticated(requestId);
      const { principal } = auth;

      if (
        !(request.headers.get("content-type") ?? "")
          .toLowerCase()
          .startsWith("application/json")
      ) {
        return errorResponse(
          415,
          "unsupported_media_type",
          "The request must be application/json.",
          requestId,
        );
      }

      const boundedBody = await readBoundedBody(request, MAX_BULK_BODY_BYTES);
      if (!boundedBody.ok && boundedBody.reason === "too_large") {
        return errorResponse(
          413,
          "payload_too_large",
          "The request body is too large.",
          requestId,
        );
      }
      if (!boundedBody.ok) {
        return errorResponse(
          400,
          "invalid_request",
          "The bulk decision request is invalid.",
          requestId,
        );
      }

      let json: unknown = null;
      try {
        json = JSON.parse(boundedBody.text);
      } catch {
        // The strict schema below returns the same safe error for malformed JSON.
      }
      const parsed = bulkDecisionRequestSchema.safeParse(json);
      if (!parsed.success) {
        return errorResponse(
          400,
          "invalid_request",
          "The bulk decision request is invalid.",
          requestId,
          {
            fields: parsed.error.issues.map(
              (issue) => issue.path.join(".") || "(body)",
            ),
          },
        );
      }

      const backend = deps.backend ?? getBackend();
      const audit = deps.audit ?? getAuditBackend();
      const runs = deps.runs ?? getRunsBackend();
      const ctx: BackendContext = { requestId, principal };
      const results = new Map<string, BulkDecisionItemResult>();
      const commands: Array<BulkDecideCommand & { idempotencyKey: string }> = [];
      const auditRunIds = new Map<string, string | null | undefined>();
      const itemAudit = (
        item: (typeof parsed.data.decisions)[number],
        tenantId: string,
        eventType: AuditEventType,
        outcome: AuditOutcome,
        summary: string,
        details?: AuditDetails,
      ) =>
        recordAuditEvent(audit, ctx, {
          tenantId,
          eventType,
          outcome,
          summary,
          details,
          actorType: "user",
          actorId: principal.userId,
          actionId: item.actionId,
          runId: auditRunIds.get(item.actionId),
          requestId,
        });

      for (const item of parsed.data.decisions) {
        const rateLimit = consumeRateLimit(`decision:${principal.userId}`, {
          limit: 30,
          windowMs: 60_000,
        });
        if (!rateLimit.allowed) {
          results.set(item.actionId, {
            actionId: item.actionId,
            decision: item.decision,
            outcome: "failed",
            message: "This decision was not sent because the decision rate limit was reached.",
          });
          continue;
        }

        let action;
        try {
          action = await backend.getAction(ctx, item.actionId);
        } catch (error) {
          if (error instanceof BackendError && error.kind === "unavailable") {
            // No decision commands have been sent yet.
            return backendFailure(error, requestId, true);
          }
          results.set(item.actionId, {
            actionId: item.actionId,
            decision: item.decision,
            outcome: "failed",
            message: "The action could not be checked, so no decision was sent.",
          });
          continue;
        }

        const tenantId = action?.targetRecord.tenantId;
        if (
          !action ||
          tenantId === undefined ||
          !principal.tenantIds.includes(tenantId)
        ) {
          results.set(item.actionId, {
            actionId: item.actionId,
            decision: item.decision,
            outcome: "forbidden",
            message: "This action is unavailable to your account.",
          });
          continue;
        }

        auditRunIds.set(
          item.actionId,
          await resolveAuditRunId(action, tenantId, ctx, runs),
        );

        const permission = `action:${item.decision}` as const;
        if (!authorize(principal, permission, { tenantId }).allowed) {
          await itemAudit(
            item,
            tenantId,
            "decision.denied",
            "rejected",
            "Decision denied: the user lacks permission to decide actions.",
            { decision: item.decision },
          );
          results.set(item.actionId, {
            actionId: item.actionId,
            decision: item.decision,
            outcome: "forbidden",
            message: "You do not have permission to make this decision.",
          });
          continue;
        }

        const scope = `${principal.userId}|${item.idempotencyKey}`;
        const fingerprint = JSON.stringify([
          tenantId,
          item.actionId,
          item.decision,
          item.recordVersion,
          item.reason ?? "",
        ]);
        let recorded;
        try {
          recorded = await backend.findRecordedDecision(ctx, scope, fingerprint);
        } catch (error) {
          if (error instanceof BackendError && error.kind === "unavailable") {
            // Preflight is complete before any write is issued.
            return backendFailure(error, requestId, true);
          }
          results.set(item.actionId, {
            actionId: item.actionId,
            decision: item.decision,
            outcome: "failed",
            message: "The previous decision could not be checked, so no decision was sent.",
          });
          continue;
        }

        if (recorded.kind === "key-reuse") {
          results.set(item.actionId, {
            actionId: item.actionId,
            decision: item.decision,
            outcome: "failed",
            message: "This idempotency key belongs to a different decision.",
          });
          continue;
        }
        if (recorded.kind === "replay") {
          const expectedStatus = item.decision === "approve" ? "approved" : "rejected";
          if (recorded.result.status !== expectedStatus) {
            results.set(item.actionId, {
              actionId: item.actionId,
              decision: item.decision,
              outcome: "outcome_unknown",
              message: "The stored result could not be confirmed for this decision.",
            });
            await itemAudit(
              item,
              tenantId,
              "decision.outcome_unknown",
              "unknown",
              "The decision outcome could not be confirmed; it may or may not have been recorded.",
              { decision: item.decision, recordVersion: item.recordVersion },
            );
            continue;
          }
          results.set(item.actionId, {
            actionId: item.actionId,
            decision: item.decision,
            outcome: item.decision === "approve" ? "approved" : "rejected",
            status: expectedStatus,
            recordVersion: recorded.result.recordVersion,
            message: "This decision was already recorded; returning the original result.",
          });
          continue;
        }

        if (action.status !== "pending" || action.recordVersion !== item.recordVersion) {
          const conflictCode =
            action.status !== "pending" ? "invalid_transition" : "version_conflict";
          await itemAudit(
            item,
            tenantId,
            "decision.conflict",
            "rejected",
            action.status !== "pending"
              ? "Decision rejected: the action cannot take this decision in its current state."
              : "Decision rejected: the action changed after it was loaded.",
            {
              decision: item.decision,
              recordVersion: item.recordVersion,
              conflictCode,
            },
          );
          results.set(item.actionId, {
            actionId: item.actionId,
            decision: item.decision,
            outcome: "conflict",
            message:
              action.status !== "pending"
                ? "The action is no longer pending."
                : "The action changed after it was loaded.",
          });
          continue;
        }

        commands.push({ ...item, tenantId });
      }

      if (commands.length > 0) {
        let outcomes;
        try {
          outcomes = await backend.bulkDecide(ctx, commands);
        } catch (error) {
          if (error instanceof BackendError && error.kind === "unavailable") {
            // The bridge adapter's unavailable response guarantees that nothing was sent.
            return backendFailure(error, requestId, true);
          }
          outcomes = commands.map((command) => ({
            actionId: command.actionId,
            decision: command.decision,
            kind: "outcome_unknown" as const,
          }));
        }

        const outcomesById = new Map(
          outcomes.map((outcome) => [outcome.actionId, outcome]),
        );
        for (const command of commands) {
          const item = parsed.data.decisions.find(
            (candidate) => candidate.actionId === command.actionId,
          )!;
          const outcome = outcomesById.get(command.actionId);
          const tenantId = command.tenantId;

          if (!outcome || outcome.decision !== command.decision) {
            results.set(command.actionId, {
              actionId: command.actionId,
              decision: command.decision,
              outcome: "outcome_unknown",
              message: "The backend did not confirm this decision.",
            });
            await itemAudit(
              item,
              tenantId,
              "decision.outcome_unknown",
              "unknown",
              "The decision outcome could not be confirmed; it may or may not have been recorded.",
              { decision: command.decision, recordVersion: command.recordVersion },
            );
            continue;
          }

          if (outcome.kind === "committed" || outcome.kind === "replayed") {
            const checked = decisionResultSchema.safeParse(outcome.result);
            const expectedStatus =
              command.decision === "approve" ? "approved" : "rejected";
            if (
              !checked.success ||
              checked.data.actionId !== command.actionId ||
              checked.data.decision !== command.decision ||
              checked.data.status !== expectedStatus
            ) {
              results.set(command.actionId, {
                actionId: command.actionId,
                decision: command.decision,
                outcome: "outcome_unknown",
                message: "The backend response could not confirm this decision.",
              });
              await itemAudit(
                item,
                tenantId,
                "decision.outcome_unknown",
                "unknown",
                "The decision outcome could not be confirmed; it may or may not have been recorded.",
                { decision: command.decision, recordVersion: command.recordVersion },
              );
              continue;
            }

            results.set(command.actionId, {
              actionId: command.actionId,
              decision: command.decision,
              outcome: command.decision === "approve" ? "approved" : "rejected",
              status: checked.data.status,
              recordVersion: checked.data.recordVersion,
              message:
                command.decision === "approve"
                  ? "Approval accepted. Execution has not been performed."
                  : "Rejection accepted.",
            });
            if (outcome.kind !== "replayed") {
              await itemAudit(
                item,
                tenantId,
                "decision.accepted",
                "success",
                command.decision === "approve"
                  ? "Approval accepted by the backend. Execution has not been performed."
                  : "Rejection accepted by the backend.",
                {
                  decision: command.decision,
                  recordVersion: command.recordVersion,
                  reasonProvided: Boolean(command.reason?.trim()),
                  resultingStatus: checked.data.status,
                },
              );
            }
            continue;
          }

          if (outcome.kind === "outcome_unknown") {
            results.set(command.actionId, {
              actionId: command.actionId,
              decision: command.decision,
              outcome: "outcome_unknown",
              message: "The decision may or may not have been recorded. Recheck the queue before retrying.",
            });
            await itemAudit(
              item,
              tenantId,
              "decision.outcome_unknown",
              "unknown",
              "The decision outcome could not be confirmed; it may or may not have been recorded.",
              { decision: command.decision, recordVersion: command.recordVersion },
            );
            continue;
          }

          if (outcome.code === "forbidden") {
            results.set(command.actionId, {
              actionId: command.actionId,
              decision: command.decision,
              outcome: "forbidden",
              message: "The backend denied this decision.",
            });
            await itemAudit(
              item,
              tenantId,
              "decision.denied",
              "rejected",
              "Decision denied by the backend: the user is not permitted to decide this action.",
              { decision: command.decision },
            );
          } else if (outcome.code === "version_conflict" || outcome.code === "invalid_transition") {
            results.set(command.actionId, {
              actionId: command.actionId,
              decision: command.decision,
              outcome: "conflict",
              message: "The action changed before the decision could be recorded.",
            });
            await itemAudit(
              item,
              tenantId,
              "decision.conflict",
              "rejected",
              "Decision rejected because the action changed before it could be recorded.",
              {
                decision: command.decision,
                recordVersion: command.recordVersion,
                conflictCode: outcome.code,
              },
            );
          } else if (outcome.code === "idempotency_key_reuse") {
            results.set(command.actionId, {
              actionId: command.actionId,
              decision: command.decision,
              outcome: "failed",
              message: "This idempotency key belongs to a different decision.",
            });
          } else {
            results.set(command.actionId, {
              actionId: command.actionId,
              decision: command.decision,
              outcome: "forbidden",
              message: "This action is unavailable to your account.",
            });
          }
        }
      }

      const response = bulkDecisionResultSchema.parse({
        results: parsed.data.decisions.map((item) => results.get(item.actionId)),
      });
      return jsonResponse(response, requestId);
    }
