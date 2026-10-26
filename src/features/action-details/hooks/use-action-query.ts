"use client";

import { useQuery } from "@tanstack/react-query";
import { approvalKeys } from "@/features/approvals/hooks/use-actions-query";
import { actionsService } from "@/features/approvals/services";
import type { ActionsService } from "@/features/approvals/types";

/**
 * Loads one action through the service (never `fetch` directly).
 *
 * - The query key is `approvalKeys.detail(actionId)`.
 * - `signal` lets TanStack Query abort an obsolete request (e.g. navigating to
 *   another action) and the service rethrows aborts unchanged.
 * - `staleTime: 0`: the displayed `recordVersion` is what a decision submits,
 *   so cached data is always revalidated on mount. While a refetch is running
 *   or has failed, the UI treats the data as stale and blocks decisions.
 * - No automatic retry: the user retries explicitly.
 */
export function useActionQuery(
  actionId: string,
  service: ActionsService = actionsService,
) {
  return useQuery({
    queryKey: approvalKeys.detail(actionId),
    queryFn: ({ signal }) => service.getAction(actionId, { signal }),
    staleTime: 0,
    retry: false,
  });
}
