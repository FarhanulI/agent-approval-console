import { authorize } from "@/lib/auth/policy";
import { resolvePrincipal } from "@/lib/auth/principal";
import {
  errorResponse,
  forbidden,
  getRequestId,
  jsonResponse,
  unauthenticated,
} from "@/lib/server/http";
import { BackendError } from "@/features/approvals/server/actions-backend";
import { toAuditEventDto, type AuditEventRecord } from "../schemas/audit-event";
import { parseAuditEventQuery } from "../schemas/audit-query";
import type { AuditBackend, AuditContext, NewAuditEvent } from "./audit-backend";
import { getAuditBackend } from "./get-audit-backend";

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

type Deps = { audit?: AuditBackend };

function auditFailure(error: unknown, requestId: string) {
  if (error instanceof BackendError) {
    if (error.kind === "unavailable") {
      return errorResponse(
        503,
        "audit_unavailable",
        "Audit history is not available in this environment.",
        requestId,
      );
    }
    return errorResponse(
      error.kind === "timeout" ? 504 : 502,
      "bad_gateway",
      "The audit backend could not complete the request.",
      requestId,
    );
  }
  return errorResponse(500, "internal_error", "An unexpected error occurred.", requestId);
}

/** Same message for missing and cross-tenant events, so existence is not revealed. */
const eventNotFound = (requestId: string) =>
  errorResponse(404, "not_found", "Audit event not found.", requestId);

/**
 * `GET /api/audit-events` BFF (proposed contract, read-only).
 *
 * Order: session (401) → `audit:view` (403) → strict query validation (400:
 * unknown keys such as `tenantId`/`actorId`/`role` are rejected) → backend
 * query scoped by the session's tenants → defensive tenant check (502, fail
 * closed) → DTO mapping that drops `tenantId`. Tenant scope comes only from
 * the session; the backend must enforce it too (unverified for the bridge).
 */
export async function handleListAuditEvents(request: Request, deps: Deps = {}) {
  const requestId = getRequestId(request);
  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) return unauthenticated(requestId);
  const { principal } = auth;
  if (!authorize(principal, "audit:view").allowed) return forbidden(requestId);

  const parsed = parseAuditEventQuery(new URL(request.url).searchParams);
  if (!parsed.success) {
    return errorResponse(400, "invalid_query", "One or more query parameters are invalid.", requestId, {
      fields: parsed.error.issues.map((issue) => issue.path.join(".") || "(query)"),
    });
  }

  const ctx: AuditContext = { requestId, principal };
  try {
    const result = await (deps.audit ?? getAuditBackend()).list(ctx, parsed.data);
    if (result.items.some((item) => !principal.tenantIds.includes(item.tenantId))) {
      return errorResponse(502, "bad_gateway", "The audit backend could not complete the request.", requestId);
    }
    return jsonResponse(
      { items: result.items.map(toAuditEventDto), pagination: result.pagination },
      requestId,
    );
  } catch (error) {
    return auditFailure(error, requestId);
  }
}

/** `GET /api/audit-events/:eventId` BFF. Missing and cross-tenant events both give the same 404. */
export async function handleGetAuditEvent(request: Request, eventId: string, deps: Deps = {}) {
  const requestId = getRequestId(request);
  const auth = await resolvePrincipal(request);
  if (!auth.authenticated) return unauthenticated(requestId);
  const { principal } = auth;
  if (!authorize(principal, "audit:view").allowed) return forbidden(requestId);
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return errorResponse(400, "invalid_request", "The event identifier is invalid.", requestId);
  }

  try {
    const event = await (deps.audit ?? getAuditBackend()).get({ requestId, principal }, eventId);
    if (!event || !principal.tenantIds.includes(event.tenantId)) return eventNotFound(requestId);
    return jsonResponse(toAuditEventDto(event satisfies AuditEventRecord), requestId);
  } catch (error) {
    return auditFailure(error, requestId);
  }
}

/**
 * Records an audit event without letting an audit failure change the outcome
 * of the operation it describes. LIMITATION: the state change and this write
 * are not atomic, so a failure here leaves a decision without an audit entry.
 * That gap is logged and documented; it is not hidden.
 */
export async function recordAuditEvent(
  audit: AuditBackend,
  ctx: AuditContext,
  event: NewAuditEvent,
): Promise<void> {
  try {
    await audit.record(ctx, event);
  } catch {
    if (process.env.NODE_ENV !== "test") {
      console.error(
        JSON.stringify({ scope: "audit", event: "audit_record_failed", requestId: ctx.requestId }),
      );
    }
  }
}
