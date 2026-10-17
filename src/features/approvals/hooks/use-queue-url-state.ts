"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import type { QueueState } from "../types";
import { parseQueueState, serializeQueueState } from "../utils/queue-state";

/**
 * The URL is the single source of truth for navigable queue state
 * (search, filters, sort, page). Changing anything except `page` resets
 * the page to 1.
 */
export function useQueueUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseQueueState(searchParams), [searchParams]);

  const update = useCallback(
    (patch: Partial<QueueState>) => {
      const next: QueueState = {
        ...state,
        ...patch,
        page: patch.page ?? 1,
      };
      const query = serializeQueueState(next).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [state, router, pathname],
  );

  return { state, update };
}
