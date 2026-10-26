import {
  auditEventTypeSchema,
  auditOutcomeSchema,
  type AuditEventType,
  type AuditOutcome,
} from "../schemas/audit-event";
import {
  MAX_AUDIT_SEARCH_LENGTH,
  type AuditEventQuery,
  type AuditSortDirection,
} from "../schemas/audit-query";

export const AUDIT_PAGE_SIZE = 10;

/** URL/UI state. Dates are UTC calendar days (`YYYY-MM-DD`). `page` is 1-based. */
export type AuditState = {
  search: string;
  eventType?: AuditEventType;
  outcome?: AuditOutcome;
  from?: string;
  to?: string;
  direction: AuditSortDirection;
  page: number;
};

type ParamsReader = { get(name: string): string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: string | null): string | undefined =>
  value && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : undefined;

/** Lenient: invalid URL values fall back to defaults instead of throwing. */
export function parseAuditState(params: ParamsReader): AuditState {
  const page = Number.parseInt(params.get("page") ?? "", 10);
  const eventType = auditEventTypeSchema.safeParse(params.get("type"));
  const outcome = auditOutcomeSchema.safeParse(params.get("outcome"));
  const from = validDay(params.get("from"));
  let to = validDay(params.get("to"));
  if (from && to && to < from) to = undefined;
  return {
    search: (params.get("q") ?? "").trim().slice(0, MAX_AUDIT_SEARCH_LENGTH),
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
    eventType: state.eventType,
    outcome: state.outcome,
    search: state.search.trim() || undefined,
    from: state.from ? `${state.from}T00:00:00.000Z` : undefined,
    to: state.to ? `${state.to}T23:59:59.999Z` : undefined,
  };
}

export function hasActiveAuditFilters(state: AuditState): boolean {
  return Boolean(
    state.search.trim() || state.eventType || state.outcome || state.from || state.to,
  );
}

/** Clears filters but keeps the sort direction. */
export function clearAuditFilters(state: AuditState): Partial<AuditState> {
  return {
    search: "",
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
