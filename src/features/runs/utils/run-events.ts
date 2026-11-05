import type { RunStatus } from "@/features/approvals/contracts";
import type { RunEvent } from "../schemas/run";
import type { MergeRunEventsResult } from "../types";

/**
 * Merges event history by sequence, dropping repeated IDs and sequence
 * numbers. Event state never replaces the authoritative run snapshot.
 */
export function mergeRunEvents(
  current: readonly RunEvent[],
  incoming: RunEvent,
): MergeRunEventsResult {
  if (
    current.some(
      (event) => event.id === incoming.id || event.sequence === incoming.sequence,
    )
  ) {
    return { events: [...current], hasGap: hasRunEventGap(current) };
  }

  const events = [...current, incoming].sort(
    (left, right) => left.sequence - right.sequence,
  );
  return { events, hasGap: hasRunEventGap(events) };
}

export function hasRunEventGap(events: readonly RunEvent[]): boolean {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  return ordered.some((event, index) => event.sequence !== index + 1);
}

const transitions: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "failed", "cancelled"],
  running: ["waiting", "completed", "failed", "cancelled"],
  waiting: ["running", "failed", "cancelled", "rejected"],
  blocked: ["queued", "running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
  rejected: [],
};

export function canTransitionRunStatus(from: RunStatus, to: RunStatus): boolean {
  return from === to || (transitions[from]?.includes(to) ?? false);
}
