import { describe, expect, it } from "vitest";
import type { RunDetail, RunEvent } from "../schemas/run";
import {
  canTransitionRunStatus,
  hasRunEventGap,
  mergeRunEventHistory,
  mergeRunEvents,
  reconcileRunSnapshot,
} from "./run-events";

const event = (sequence: number, id = `event-${sequence}`): RunEvent => ({
  id,
  runId: "run_0100",
  sequence,
  type: "step.completed",
  timestamp: `2026-10-20T09:00:0${sequence}.000Z`,
});

describe("run event ordering", () => {
  it("orders events by sequence and ignores repeated event IDs", () => {
    const first = event(1);
    const second = event(2);
    const outOfOrder = mergeRunEvents([first], second);
    expect(outOfOrder.events.map((item) => item.sequence)).toEqual([1, 2]);
    expect(mergeRunEvents(outOfOrder.events, second).events).toEqual(outOfOrder.events);
    expect(outOfOrder.hasGap).toBe(false);
  });

  it("ignores a second event with the same sequence and detects sequence gaps", () => {
    const sameSequence = mergeRunEvents([event(1)], event(1, "duplicate-sequence"));
    expect(sameSequence.events).toHaveLength(1);
    expect(hasRunEventGap([event(1), event(3)])).toBe(true);
    expect(mergeRunEvents([event(1)], event(3)).hasGap).toBe(true);
  });

  it("scopes event identity to the run and fills a gap when a late event arrives", () => {
    const first = event(1);
    const third = event(3);
    const foreign = { ...event(2), runId: "other-run" };

    expect(mergeRunEvents([first], foreign, "run_0100").events).toEqual([first]);
    expect(mergeRunEvents([first, third], event(2), "run_0100")).toMatchObject({
      hasGap: false,
      events: [first, event(2), third],
    });
  });

  it("deduplicates duplicate batches by stable ID and sequence", () => {
    const first = event(1);
    const second = event(2);
    expect(
      mergeRunEventHistory(
        [first],
        [second, { ...second }, event(2, "other-id"), first],
        "run_0100",
      ),
    ).toEqual([first, second]);
  });

  it("reconciles from snapshots without dropping known events or regressing terminal state", () => {
    const current = {
      ...runDetailForTest("completed"),
      events: [event(1), event(3)],
    };
    const snapshot = {
      ...runDetailForTest("running"),
      events: [event(1), event(2)],
    };
    const reconciled = reconcileRunSnapshot(current, snapshot);

    expect(reconciled.status).toBe("completed");
    expect(reconciled.events.map((item) => item.sequence)).toEqual([1, 2, 3]);
  });

  it("rejects a snapshot for a different run", () => {
    expect(() =>
      reconcileRunSnapshot(runDetailForTest("running"), {
        ...runDetailForTest("running"),
        id: "run_0101",
      }),
    ).toThrow("different runs");
  });

  it("allows valid lifecycle transitions and rejects invalid or terminal transitions", () => {
    expect(canTransitionRunStatus("waiting", "running")).toBe(true);
    expect(canTransitionRunStatus("running", "completed")).toBe(true);
    expect(canTransitionRunStatus("completed", "running")).toBe(false);
    expect(canTransitionRunStatus("rejected", "completed")).toBe(false);
    expect(canTransitionRunStatus("blocked", "running")).toBe(true);
  });
});

function runDetailForTest(status: RunDetail["status"]): RunDetail {
  return {
    id: "run_0100",
    status,
    summary: "Test run",
    actionIds: [],
    startedAt: "2026-10-20T09:00:00.000Z",
    agent: { id: "agent_test", name: "Test agent" },
    steps: [],
    events: [],
  };
}
