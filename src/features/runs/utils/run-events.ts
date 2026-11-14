import type { RunStatus } from "@/features/approvals/contracts";
import type { RunDetail, RunEvent } from "../schemas/run";
import type { MergeRunEventsResult } from "../types";

export function mergeRunEvents(
  current: readonly RunEvent[],
  incoming: RunEvent,
  runId = current[0]?.runId ?? incoming.runId,
): MergeRunEventsResult {
  const scopedEvents = current.filter((event) => event.runId === runId);
  if (
    incoming.runId !== runId ||
    scopedEvents.some(
      (event) => event.id === incoming.id || event.sequence === incoming.sequence,
    )
  ) {
    return {
      events: [...scopedEvents],
      hasGap: hasRunEventGap(scopedEvents),
      added: false,
    };
  }

  const events = [...scopedEvents, incoming].sort(
    (left, right) => left.sequence - right.sequence,
  );
  return { events, hasGap: hasRunEventGap(events), added: true };
}

export function mergeRunEventHistory(
  current: readonly RunEvent[],
  incoming: readonly RunEvent[],
  runId: string,
): RunEvent[] {
  return [...current, ...incoming].reduce<RunEvent[]>(
    (events, event) => mergeRunEvents(events, event, runId).events,
    [],
  );
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

export function reconcileRunSnapshot(
  current: RunDetail,
  snapshot: RunDetail,
): RunDetail {
  if (current.id !== snapshot.id) {
    throw new Error("Cannot reconcile snapshots for different runs.");
  }

  const events = mergeRunEventHistory(current.events, snapshot.events, current.id);
  if (!canTransitionRunStatus(current.status, snapshot.status)) {
    return { ...current, events };
  }

  return { ...snapshot, events };
}
