import type { AuditEventRecord } from "@/features/audit/schemas/audit-event";
import { SEED_AUDIT_EVENTS } from "./fixtures/audit-events";

/**
 * In-memory MOCK audit state: the deterministic seed plus events recorded
 * while the process runs. Not durable (lost on restart), not immutable and not
 * atomic with the action state change; it only simulates an audit trail.
 * Shared through `globalThis` for the same reason as the action store.
 */
type AuditState = { recorded: AuditEventRecord[]; sequence: number };
const KEY = Symbol.for("agent-approval-console.mock-audit-store");
const holder = globalThis as unknown as { [KEY]?: AuditState };
holder[KEY] ??= { recorded: [], sequence: 0 };

/** Fixed clock so live events stay deterministic: 2026-10-17T09:00:00Z + 1 s per event. */
const LIVE_BASE = Date.parse("2026-10-17T09:00:00.000Z");

export function appendMockAuditEvent(
  event: Omit<AuditEventRecord, "id" | "occurredAt">,
): AuditEventRecord {
  const state = holder[KEY]!;
  state.sequence += 1;
  const record: AuditEventRecord = {
    ...event,
    id: `evt_live_${String(state.sequence).padStart(4, "0")}`,
    occurredAt: new Date(LIVE_BASE + state.sequence * 1000).toISOString(),
  };
  state.recorded.push(record);
  return record;
}

export function listAllMockAuditEvents(): AuditEventRecord[] {
  return [...SEED_AUDIT_EVENTS, ...holder[KEY]!.recorded];
}

/** Events recorded since the last reset (excludes the seed). */
export function getRecordedMockAuditEvents(): readonly AuditEventRecord[] {
  return holder[KEY]!.recorded;
}

export function resetMockAuditState(): void {
  holder[KEY] = { recorded: [], sequence: 0 };
}
