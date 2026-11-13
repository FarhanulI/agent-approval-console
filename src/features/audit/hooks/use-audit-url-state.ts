"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { parseAuditState, serializeAuditState, type AuditState } from "../utils/audit-state";

/** The URL is the single source of truth for audit filters, sort and page. */
export function useAuditUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseAuditState(searchParams), [searchParams]);
  const search = searchParams.toString();
  const latestState = useRef(state);
  const observedSearch = useRef(search);
  const pendingSearch = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (search === observedSearch.current) return;
    observedSearch.current = search;
    if (pendingSearch.current === null || pendingSearch.current === search) {
      latestState.current = state;
      if (pendingSearch.current === search) pendingSearch.current = null;
    }
  }, [search, state]);

  useEffect(() => {
    const handlePopState = () => {
      const currentSearch = window.location.search.slice(1);
      pendingSearch.current = null;
      observedSearch.current = currentSearch;
      latestState.current = parseAuditState(new URLSearchParams(currentSearch));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const update = useCallback(
    (patch: Partial<AuditState>) => {
      const next: AuditState = {
        ...latestState.current,
        ...patch,
        page: patch.page ?? 1,
      };
      latestState.current = next;
      const query = serializeAuditState(next).toString();
      pendingSearch.current = query;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  return { state, update };
}
