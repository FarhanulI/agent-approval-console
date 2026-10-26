import { z } from "zod";
import { paginationSchema } from "@/features/approvals/contracts";

/**
 * PROPOSED frontend extension of the audit contract (not part of
 * `contracts.ts`, which stays untouched). Differences from `auditEventSchema`:
 * - `eventType` is a finite union instead of a free string;
 * - `outcome` adds `unknown` (a decision whose result could not be confirmed
 *   must never read as success or as a confirmed failure);
 * - `occurredAt` (ISO 8601, UTC) replaces `timestamp`;
 * - `summary` is a safe, fixed-text description chosen by the server;
 * - `details` is a strict allow-list, never a request body.
 * Whether `erp-mcp-bridge` can supply any of this is NOT known.
 */

/**
 * - `decision.accepted`: the backend accepted an approve/reject decision. For
 *   approve this is NOT execution; execution is a separate state.
 * - `decision.conflict`: stale `recordVersion` or invalid status transition.
 * - `decision.denied`: an authenticated user lacked permission.
 * - `decision.outcome_unknown`: the outcome could not be confirmed.
 */
export const AUDIT_EVENT_TYPES = [
  "decision.accepted",
  "decision.conflict",
  "decision.denied",
  "decision.outcome_unknown",
] as const;

export const AUDIT_OUTCOMES = [
  "success",
  "failure",
  "rejected",
  "pending",
  "partial",
  "unknown",
] as const;

export const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export const auditOutcomeSchema = z.enum(AUDIT_OUTCOMES);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;

const isoDateTime = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Timestamp must be a valid ISO 8601 string.",
  });

/** Allow-listed metadata. Free text such as the decision reason is excluded. */
export const auditDetailsSchema = z.strictObject({
  decision: z.enum(["approve", "reject"]).optional(),
  recordVersion: z.number().int().nonnegative().optional(),
  reasonProvided: z.boolean().optional(),
  resultingStatus: z.string().max(40).optional(),
  conflictCode: z.string().max(40).optional(),
});
export type AuditDetails = z.infer<typeof auditDetailsSchema>;

/** Browser-facing event. Contains no tenant identifier. */
export const auditEventDtoSchema = z.strictObject({
  id: z.string().min(1).max(64),
  eventType: auditEventTypeSchema,
  outcome: auditOutcomeSchema,
  occurredAt: isoDateTime,
  actorType: z.enum(["user", "system", "agent"]),
  /** Absent for system events. */
  actorId: z.string().min(1).optional(),
  actionId: z.string().min(1).optional(),
  requestId: z.string().optional(),
  summary: z.string().min(1).max(300),
  details: auditDetailsSchema.optional(),
});
export type AuditEventDto = z.infer<typeof auditEventDtoSchema>;

/** Server-internal record: the DTO plus the tenant that owns it. Never sent to the browser. */
export const auditEventRecordSchema = auditEventDtoSchema.extend({
  tenantId: z.string().min(1),
});
export type AuditEventRecord = z.infer<typeof auditEventRecordSchema>;

/**
 * Explicit copy of the DTO fields. `tenantId` (and anything else the backend
 * attached) cannot reach the browser through this mapper.
 */
export function toAuditEventDto(record: AuditEventRecord): AuditEventDto {
  return auditEventDtoSchema.parse({
    id: record.id,
    eventType: record.eventType,
    outcome: record.outcome,
    occurredAt: record.occurredAt,
    actorType: record.actorType,
    actorId: record.actorId,
    actionId: record.actionId,
    requestId: record.requestId,
    summary: record.summary,
    details: record.details,
  });
}

export const auditEventListResponseDtoSchema = z.object({
  items: z.array(auditEventDtoSchema),
  pagination: paginationSchema,
});
export type AuditEventListResponseDto = z.infer<typeof auditEventListResponseDtoSchema>;
