import { describe, expect, it } from "vitest";
import type { RunEvent } from "../schemas/run";
import { canTransitionRunStatus, hasRunEventGap, mergeRunEvents } from "./run-events";

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

  it("allows valid lifecycle transitions and rejects invalid or terminal transitions", () => {
    expect(canTransitionRunStatus("waiting", "running")).toBe(true);
    expect(canTransitionRunStatus("running", "completed")).toBe(true);
    expect(canTransitionRunStatus("completed", "running")).toBe(false);
    expect(canTransitionRunStatus("rejected", "completed")).toBe(false);
    expect(canTransitionRunStatus("blocked", "running")).toBe(true);
  });
});
