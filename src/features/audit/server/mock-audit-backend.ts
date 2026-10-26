import { setTimeout as sleep } from "node:timers/promises";
import { BackendError } from "@/features/approvals/server/actions-backend";
import {
  appendMockAuditEvent,
  listAllMockAuditEvents,
} from "@/mocks/audit-store";
import { getAuditScenario } from "@/mocks/scenarios";
import type { AuditBackend } from "./audit-backend";

/**
 * In-memory audit backend for development and tests. MOCK ONLY: tenant
 * scoping, ordering and filtering are simulations; see `mocks/audit-store.ts`
 * for the durability limits.
 */
export function createMockAuditBackend(): AuditBackend {
  const inTenants = (tenantIds: readonly string[], tenantId: string) =>
    tenantIds.includes(tenantId);

  return {
    kind: "mock",

    async record(_ctx, event) {
      appendMockAuditEvent(event);
    },

    async list(ctx, query) {
      const scenario = getAuditScenario();
      if (scenario.kind === "ok" && scenario.delayMs) await sleep(scenario.delayMs);
      if (scenario.kind === "server-error") {
        throw new BackendError("upstream-error", "Mock upstream failure.");
      }

      const term = query.search?.trim().toLowerCase();
      const from = query.from ? Date.parse(query.from) : undefined;
      const to = query.to ? Date.parse(query.to) : undefined;
      const direction = query.sortDirection === "asc" ? 1 : -1;

      const matches =
        scenario.kind === "empty"
          ? []
          : listAllMockAuditEvents().filter((event) => {
              const at = Date.parse(event.occurredAt);
              return (
                inTenants(ctx.principal.tenantIds, event.tenantId) &&
                (!query.eventType || event.eventType === query.eventType) &&
                (!query.outcome || event.outcome === query.outcome) &&
                (!query.actionId || event.actionId === query.actionId) &&
                (from === undefined || at >= from) &&
                (to === undefined || at <= to) &&
                (!term ||
                  event.summary.toLowerCase().includes(term) ||
                  (event.actionId?.toLowerCase().includes(term) ?? false))
              );
            });

      matches.sort(
        (a, b) =>
          (Date.parse(a.occurredAt) - Date.parse(b.occurredAt)) * direction ||
          a.id.localeCompare(b.id),
      );

      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 10;
      const start = (page - 1) * pageSize;
      return {
        items: matches.slice(start, start + pageSize),
        pagination: { page, pageSize, total: matches.length },
      };
    },

    async get(ctx, eventId) {
      const scenario = getAuditScenario();
      if (scenario.kind === "server-error") {
        throw new BackendError("upstream-error", "Mock upstream failure.");
      }
      return listAllMockAuditEvents().find(
        (event) => event.id === eventId && inTenants(ctx.principal.tenantIds, event.tenantId),
      );
    },
  };
}
