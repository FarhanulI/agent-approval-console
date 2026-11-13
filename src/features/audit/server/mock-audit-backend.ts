import { setTimeout as sleep } from "node:timers/promises";
import { BackendError } from "@/features/approvals/server/actions-backend";
import { getRunsBackend } from "@/features/runs/server/get-runs-backend";
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

    async record(ctx, event) {
      if (event.runId) {
        const run = await getRunsBackend().get(ctx, event.runId);
        if (!run || run.tenantId !== event.tenantId) {
          throw new BackendError("upstream-error", "The audit event run reference is invalid.");
        }
      }
      appendMockAuditEvent(event);
    },

    async list(ctx, query) {
      const scenario = getAuditScenario();
      if (scenario.kind === "ok" && scenario.delayMs) await sleep(scenario.delayMs);
      if (scenario.kind === "server-error") {
        throw new BackendError("upstream-error", "Mock upstream failure.");
      }

      const term = query.search?.trim().toLowerCase();
      const startDate = query.startDate ? Date.parse(query.startDate) : undefined;
      const endDate = query.endDate ? Date.parse(query.endDate) : undefined;
      const direction = query.sortDirection === "asc" ? 1 : -1;

      const matches =
        scenario.kind === "empty"
          ? []
          : listAllMockAuditEvents().filter((event) => {
              const at = Date.parse(event.occurredAt);
              return (
                inTenants(ctx.principal.tenantIds, event.tenantId) &&
                  (!query.actorId || event.actorId === query.actorId) &&
                  (!query.actorType || event.actorType === query.actorType) &&
                  (!query.userId ||
                    (event.actorType === "user" && event.actorId === query.userId)) &&
                  (!query.systemId ||
                    (event.actorType === "system" && event.actorId === query.systemId)) &&
                  (!query.agentId ||
                    (event.actorType === "agent" && event.actorId === query.agentId)) &&
                  (!query.eventType || event.eventType === query.eventType) &&
                  (!query.outcome || event.outcome === query.outcome) &&
                  (!query.actionId || event.actionId === query.actionId) &&
                  (!query.runId || event.runId === query.runId) &&
                  (startDate === undefined || at >= startDate) &&
                  (endDate === undefined || at <= endDate) &&
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
