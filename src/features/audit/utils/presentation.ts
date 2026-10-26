import type { AuditEventType, AuditOutcome } from "../schemas/audit-event";

export const eventTypeLabels: Record<AuditEventType, string> = {
  "decision.accepted": "Decision accepted",
  "decision.conflict": "Decision conflict",
  "decision.denied": "Decision denied",
  "decision.outcome_unknown": "Outcome unknown",
};

export const outcomeLabels: Record<AuditOutcome, string> = {
  success: "Success",
  failure: "Failure",
  rejected: "Rejected",
  pending: "Pending",
  partial: "Partial",
  unknown: "Unknown",
};

export type OutcomeTone = "success" | "danger" | "warning" | "info" | "neutral";

/** `unknown` is deliberately a distinct, non-success tone. */
export const outcomeTones: Record<AuditOutcome, OutcomeTone> = {
  success: "success",
  failure: "danger",
  rejected: "danger",
  pending: "info",
  partial: "warning",
  unknown: "warning",
};

/** Same pattern the server accepts for action ids; anything else is shown as text only. */
export function isLinkableActionId(actionId: string | undefined): actionId is string {
  return actionId !== undefined && /^[A-Za-z0-9_-]{1,64}$/.test(actionId);
}
