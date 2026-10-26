import { actionFixtures } from "@/mocks/fixtures/actions";
import type { AuditEventRecord } from "@/features/audit/schemas/audit-event";

/**
 * Deterministic seed history for the MOCK audit store. Entirely fictional;
 * every event is tied to a fixture action, in that action's tenant.
 */
const BASE = Date.parse("2026-10-01T08:00:00.000Z");
const STEP_MS = 3 * 60 * 60 * 1000;

const TEMPLATES: readonly Pick<AuditEventRecord, "eventType" | "outcome" | "summary">[] = [
  { eventType: "decision.accepted", outcome: "success", summary: "Decision accepted by the mock backend. Execution was not performed." },
  { eventType: "decision.conflict", outcome: "rejected", summary: "Decision rejected: the action changed after it was loaded." },
  { eventType: "decision.denied", outcome: "rejected", summary: "Decision denied: the user lacks permission to decide actions." },
  { eventType: "decision.outcome_unknown", outcome: "unknown", summary: "The decision outcome could not be confirmed; it may or may not have been recorded." },
  { eventType: "decision.accepted", outcome: "success", summary: "Decision accepted by the mock backend. Execution was not performed." },
];

export const SEED_AUDIT_EVENTS: readonly AuditEventRecord[] = actionFixtures
  .slice(0, 30)
  .map((action, index) => {
    const template = TEMPLATES[index % TEMPLATES.length]!;
    const isSystem = index % 7 === 6;
    return {
      id: `evt_seed_${String(index + 1).padStart(4, "0")}`,
      tenantId: action.targetRecord.tenantId ?? "tenant_main",
      ...template,
      occurredAt: new Date(BASE + index * STEP_MS).toISOString(),
      actorType: isSystem ? "system" : "user",
      actorId: isSystem ? undefined : index % 2 === 0 ? "usr_dev_reviewer" : "usr_dev_main_reviewer",
      actionId: action.id,
      requestId: `req_seed_${String(index + 1).padStart(4, "0")}`,
      details:
        template.eventType === "decision.accepted"
          ? { decision: index % 2 === 0 ? "approve" : "reject", recordVersion: 1, reasonProvided: index % 3 === 0 }
          : undefined,
    } satisfies AuditEventRecord;
  });
