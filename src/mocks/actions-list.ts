import type {
  ActionListResponse,
  PendingAction,
  RiskLevel,
} from "@/features/approvals/contracts";
import type { ActionListQuery } from "@/features/approvals/types";

export const DEFAULT_PAGE_SIZE = 10;

const riskRank: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Searchable fields (mock assumption, documented in the report): title,
 * summary, id, target label/recordId, and agent name. Case-insensitive.
 */
function matchesSearch(action: PendingAction, term: string): boolean {
  const haystack = [
    action.id,
    action.title,
    action.summary,
    action.targetRecord.label,
    action.targetRecord.recordId,
    action.agent?.name,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n")
    .toLowerCase();
  return haystack.includes(term);
}

function compare(a: PendingAction, b: PendingAction, query: ActionListQuery) {
  const direction = query.sortDirection === "asc" ? 1 : -1;
  const result =
    query.sortBy === "risk"
      ? riskRank[a.risk] - riskRank[b.risk]
      : Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (result !== 0) return result * direction;
  // Stable, deterministic tie-breaker: newest first, then id.
  return (
    Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id)
  );
}

/** Pure list logic behind the MSW handler: filter, sort, paginate. */
export function queryActions(
  fixtures: readonly PendingAction[],
  query: ActionListQuery,
): ActionListResponse {
  const term = query.search?.trim().toLowerCase();
  const filtered = fixtures.filter(
    (action) =>
      (!query.status || action.status === query.status) &&
      (!query.risk || action.risk === query.risk) &&
      (!term || matchesSearch(action, term)),
  );
  // Default order when no sort is requested: createdAt descending.
  const effective: ActionListQuery = {
    ...query,
    sortBy: query.sortBy ?? "createdAt",
    sortDirection: query.sortDirection ?? "desc",
  };
  const sorted = [...filtered].sort((a, b) => compare(a, b, effective));

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const start = (page - 1) * pageSize;

  return {
    items: sorted.slice(start, start + pageSize),
    pagination: { page, pageSize, total: sorted.length },
  };
}
