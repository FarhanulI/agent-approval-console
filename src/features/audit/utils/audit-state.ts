import {
  auditActorTypeSchema,
  auditEventTypeSchema,
  auditOutcomeSchema,
  type AuditActorType,
  type AuditEventType,
  type AuditOutcome,
} from "../schemas/audit-event";
import {
  auditIdentifierSchema,
  MAX_AUDIT_SEARCH_LENGTH,
  type AuditEventQuery,
  type AuditSortDirection,
} from "../schemas/audit-query";

export const AUDIT_PAGE_SIZE = 10;

/** URL/UI state. Dates are UTC calendar days (`YYYY-MM-DD`). `page` is 1-based. */
export type AuditState = {
  search: string;
  actorId?: string;
  actorType?: AuditActorType;
  userId?: string;
  systemId?: string;
  agentId?: string;
  eventType?: AuditEventType;
  outcome?: AuditOutcome;
  from?: string;
  to?: string;
  direction: AuditSortDirection;
  page: number;
};

type ParamsReader = { get(name: string): string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: string | null): string | undefined => {
  if (!value || !DAY.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : undefined;
};

function validIdentifier(value: string | null): string | undefined {
  const parsed = auditIdentifierSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Lenient: invalid URL values fall back to defaults instead of throwing. */
export function parseAuditState(params: ParamsReader): AuditState {
  const page = Number.parseInt(params.get("page") ?? "", 10);
  const actorType = auditActorTypeSchema.safeParse(params.get("actorType"));
  const eventType = auditEventTypeSchema.safeParse(params.get("type"));
  const outcome = auditOutcomeSchema.safeParse(params.get("outcome"));
  const from = validDay(params.get("from"));
  let to = validDay(params.get("to"));
  if (from && to && to < from) to = undefined;
  return {
    search: (params.get("q") ?? "").trim().slice(0, MAX_AUDIT_SEARCH_LENGTH),
    actorId: validIdentifier(params.get("actorId")),
    actorType: actorType.success ? actorType.data : undefined,
    userId: validIdentifier(params.get("userId")),
    systemId: validIdentifier(params.get("systemId")),
    agentId: validIdentifier(params.get("agentId")),
    eventType: eventType.success ? eventType.data : undefined,
    outcome: outcome.success ? outcome.data : undefined,
    from,
    to,
    direction: params.get("sort") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Omits defaults so the canonical audit URL stays clean. */
export function serializeAuditState(state: AuditState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.search.trim()) params.set("q", state.search.trim());
  if (state.actorId) params.set("actorId", state.actorId);
  if (state.actorType) params.set("actorType", state.actorType);
  if (state.userId) params.set("userId", state.userId);
  if (state.systemId) params.set("systemId", state.systemId);
  if (state.agentId) params.set("agentId", state.agentId);
  if (state.eventType) params.set("type", state.eventType);
  if (state.outcome) params.set("outcome", state.outcome);
  if (state.from) params.set("from", state.from);
  if (state.to) params.set("to", state.to);
  if (state.direction === "asc") params.set("sort", "asc");
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function toAuditQuery(state: AuditState): AuditEventQuery {
  return {
    page: state.page,
    pageSize: AUDIT_PAGE_SIZE,
    sortBy: "occurredAt",
    sortDirection: state.direction,
    actorId: state.actorId,
    actorType: state.actorType,
    userId: state.userId,
    systemId: state.systemId,
    agentId: state.agentId,
    eventType: state.eventType,
    outcome: state.outcome,
    search: state.search.trim() || undefined,
    startDate: state.from ? `${state.from}T00:00:00.000Z` : undefined,
    endDate: state.to ? `${state.to}T23:59:59.999Z` : undefined,
  };
}

export function hasActiveAuditFilters(state: AuditState): boolean {
  return Boolean(
    state.search.trim() ||
      state.actorId ||
      state.actorType ||
      state.userId ||
      state.systemId ||
      state.agentId ||
      state.eventType ||
      state.outcome ||
      state.from ||
      state.to,
  );
}

/** Clears filters but keeps the sort direction. */
export function clearAuditFilters(state: AuditState): Partial<AuditState> {
  return {
    search: "",
    actorId: undefined,
    actorType: undefined,
    userId: undefined,
    systemId: undefined,
    agentId: undefined,
    eventType: undefined,
    outcome: undefined,
    from: undefined,
    to: undefined,
    direction: state.direction,
  };
}

export function lastAuditPage(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
