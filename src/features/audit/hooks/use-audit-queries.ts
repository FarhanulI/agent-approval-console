"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AuditEventQuery } from "../schemas/audit-query";
import { auditService } from "../services";
import type { AuditService } from "../types";

export const auditKeys = {
  all: ["audit"] as const,
  lists: () => [...auditKeys.all, "list"] as const,
  list: (query: AuditEventQuery) => [...auditKeys.lists(), query] as const,
  details: () => [...auditKeys.all, "detail"] as const,
  detail: (eventId: string) => [...auditKeys.details(), eventId] as const,
};

export function useAuditEventsQuery(query: AuditEventQuery, service: AuditService = auditService) {
  return useQuery({
    queryKey: auditKeys.list(query),
    queryFn: ({ signal }) => service.listEvents(query, { signal }),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** Loads one event for the detail dialog; disabled while no event is selected. */
export function useAuditEventQuery(eventId: string | null, service: AuditService = auditService) {
  return useQuery({
    queryKey: auditKeys.detail(eventId ?? ""),
    queryFn: ({ signal }) => service.getEvent(eventId ?? "", { signal }),
    enabled: eventId !== null,
    retry: false,
  });
}
