import type { SortingState } from "@tanstack/react-table";
import { approvalStatusSchema, riskLevelSchema } from "../contracts";
import { MAX_SEARCH_LENGTH } from "../schemas/action-list-query";
import {
  ACTION_SORT_FIELDS,
  type ActionListQuery,
  type ActionSort,
  type QueueState,
  type SortDirection,
} from "../types";

export const PAGE_SIZE = 10;

/** Matches the server default order assumed by the proposed contract. */
export const DEFAULT_SORT: ActionSort = { field: "createdAt", direction: "desc" };

type ParamsReader = { get(name: string): string | null };

function parseSort(value: string | null): ActionSort {
  if (!value) return DEFAULT_SORT;
  const direction: SortDirection = value.startsWith("-") ? "desc" : "asc";
  const field = value.replace(/^-/, "");
  const match = ACTION_SORT_FIELDS.find((candidate) => candidate === field);
  return match ? { field: match, direction } : DEFAULT_SORT;
}

/** Lenient: any invalid URL value falls back to its default instead of throwing. */
export function parseQueueState(params: ParamsReader): QueueState {
  const page = Number.parseInt(params.get("page") ?? "", 10);
  const status = approvalStatusSchema.safeParse(params.get("status"));
  const risk = riskLevelSchema.safeParse(params.get("risk"));

  return {
    search: (params.get("q") ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    status: status.success ? status.data : undefined,
    risk: risk.success ? risk.data : undefined,
    sort: parseSort(params.get("sort")),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Omits defaults so the canonical queue URL stays clean. */
export function serializeQueueState(state: QueueState): URLSearchParams {
  const params = new URLSearchParams();
  const search = state.search.trim();
  if (search) params.set("q", search);
  if (state.status) params.set("status", state.status);
  if (state.risk) params.set("risk", state.risk);
  if (
    state.sort.field !== DEFAULT_SORT.field ||
    state.sort.direction !== DEFAULT_SORT.direction
  ) {
    params.set(
      "sort",
      `${state.sort.direction === "desc" ? "-" : ""}${state.sort.field}`,
    );
  }
  if (state.page > 1) params.set("page", String(state.page));
  return params;
}

export function toActionListQuery(state: QueueState): ActionListQuery {
  return {
    page: state.page,
    pageSize: PAGE_SIZE,
    status: state.status,
    risk: state.risk,
    search: state.search.trim() || undefined,
    sortBy: state.sort.field,
    sortDirection: state.sort.direction,
  };
}

export function sortToSortingState(sort: ActionSort): SortingState {
  return [{ id: sort.field, desc: sort.direction === "desc" }];
}

/** Returns null when the table state does not map to a server-sortable field. */
export function sortingStateToSort(sorting: SortingState): ActionSort | null {
  const [first] = sorting;
  const field = ACTION_SORT_FIELDS.find((candidate) => candidate === first?.id);
  if (!first || !field) return null;
  return { field, direction: first.desc ? "desc" : "asc" };
}

export function hasActiveFilters(state: QueueState): boolean {
  return Boolean(state.search.trim() || state.status || state.risk);
}

export function clearFilters(state: QueueState): QueueState {
  return { ...state, search: "", status: undefined, risk: undefined, page: 1 };
}

export function lastPage(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
