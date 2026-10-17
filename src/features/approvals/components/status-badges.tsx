import { Badge } from "@/components/ui/badge";
import type { ApprovalStatus, RiskLevel } from "../contracts";
import {
  riskLabels,
  riskTones,
  statusLabels,
  statusTones,
} from "../utils/presentation";

// The text label carries the meaning; tone is only reinforcement.
export function StatusBadge({ status }: { status: ApprovalStatus }) {
  return <Badge tone={statusTones[status]}>{statusLabels[status]}</Badge>;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <Badge tone={riskTones[risk]}>{riskLabels[risk]}</Badge>;
}
