import { Badge } from "@/components/ui/badge";
import type { AuditEventType, AuditOutcome } from "../schemas/audit-event";
import { eventTypeLabels, outcomeLabels, outcomeTones } from "../utils/presentation";

export function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  return <Badge tone={outcomeTones[outcome]}>{outcomeLabels[outcome]}</Badge>;
}

export function EventTypeBadge({ eventType }: { eventType: AuditEventType }) {
  return <Badge tone="neutral">{eventTypeLabels[eventType]}</Badge>;
}
