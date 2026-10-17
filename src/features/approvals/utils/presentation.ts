import type { BadgeProps } from "@/components/ui/badge";
import type { ApprovalStatus, RiskLevel } from "../contracts";

type Tone = NonNullable<BadgeProps["tone"]>;

export const statusLabels: Record<ApprovalStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired",
  cancelled: "Cancelled",
  executing: "Executing",
  executed: "Executed",
  failed: "Failed",
  conflict: "Conflict",
};

export const statusTones: Record<ApprovalStatus, Tone> = {
  pending: "info",
  approved: "success",
  rejected: "danger",
  expired: "neutral",
  cancelled: "neutral",
  executing: "accent",
  executed: "success",
  failed: "danger",
  conflict: "warning",
};

export const riskLabels: Record<RiskLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const riskTones: Record<RiskLevel, Tone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const statusOptions = Object.keys(statusLabels) as ApprovalStatus[];
export const riskOptions = Object.keys(riskLabels) as RiskLevel[];

/** Only pending actions can receive a decision, so only they are selectable. */
export function isSelectable(status: ApprovalStatus): boolean {
  return status === "pending";
}
