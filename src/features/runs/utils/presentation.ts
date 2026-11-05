import type { RunSummary } from "../schemas/run";

export const runStatusLabels: Record<RunSummary["status"], string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting for approval",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  blocked: "Blocked",
  rejected: "Rejected",
};

export function runStatusTone(
  status: RunSummary["status"],
): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "info";
    case "waiting":
    case "queued":
    case "blocked":
      return "warning";
    case "failed":
    case "cancelled":
    case "rejected":
      return "danger";
  }
}

export function formatRunTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatDuration(startedAt: string, endedAt?: string): string {
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  const seconds = Math.max(0, Math.floor((end - Date.parse(startedAt)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
