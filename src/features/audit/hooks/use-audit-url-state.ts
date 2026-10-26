"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { parseAuditState, serializeAuditState, type AuditState } from "../utils/audit-state";

/** The URL is the single source of truth for audit filters, sort and page. */
export function useAuditUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseAuditState(searchParams), [searchParams]);

  const update = useCallback(
    (patch: Partial<AuditState>) => {
      const next: AuditState = { ...state, ...patch, page: patch.page ?? 1 };
      const query = serializeAuditState(next).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [state, router, pathname],
  );

  return { state, update };
}
