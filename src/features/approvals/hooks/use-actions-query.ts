"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { actionsService } from "../services";
import type { ActionListQuery, ActionsService } from "../types";

/**
 * Every server-affecting parameter is part of the key. List and detail keys
 * share the `["approvals", "actions"]` prefix but are disjoint: invalidating
 * `lists()` never touches a detail entry and vice versa.
 */
export const approvalKeys = {
  all: ["approvals"] as const,
  details: () => [...approvalKeys.all, "actions", "detail"] as const,
  detail: (actionId: string) => [...approvalKeys.details(), actionId] as const,
  lists: () => [...approvalKeys.all, "actions", "list"] as const,
  list: (query: ActionListQuery) =>
    [
      ...approvalKeys.lists(),
      {
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        risk: query.risk,
        search: query.search,
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      },
    ] as const,
};

export function useActionsQuery(
  query: ActionListQuery,
  service: ActionsService = actionsService,
) {
  return useQuery({
    queryKey: approvalKeys.list(query),
    // `signal` lets TanStack Query abort obsolete requests.
    queryFn: ({ signal }) => service.listActions(query, { signal }),
    // Keep the previous page on screen while the next one loads; the UI marks
    // it as stale via `isPlaceholderData`.
    placeholderData: keepPreviousData,
    // Reads are not retried automatically; the user retries explicitly.
    retry: false,
  });
}
