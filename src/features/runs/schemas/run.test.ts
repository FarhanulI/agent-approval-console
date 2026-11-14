import { describe, expect, it } from "vitest";
import { runFixtures } from "@/mocks/fixtures/runs";
import {
  runDetailSchema,
  runEventSchema,
  runStreamRecoverySchema,
} from "./run";

describe("run timeline schemas", () => {
  it("accepts the deterministic run snapshots and ordered events", () => {
    for (const run of runFixtures) {
      expect(runDetailSchema.safeParse(run).success).toBe(true);
      for (const event of run.events) {
        expect(runEventSchema.safeParse(event).success).toBe(true);
      }
    }
  });

  it("rejects invalid event ordering metadata and unapproved payload fields", () => {
    const event = runFixtures[0].events[0];
    expect(runEventSchema.safeParse({ ...event, sequence: 0 }).success).toBe(false);
    expect(
      runEventSchema.safeParse({
        ...event,
        payload: { message: "safe summary", accessToken: "secret" },
      }).success,
    ).toBe(false);
    expect(runEventSchema.safeParse({ ...event, unexpected: true }).success).toBe(false);
  });

  it("rejects invalid run and step states", () => {
    expect(
      runDetailSchema.safeParse({ ...runFixtures[0], status: "executing" }).success,
    ).toBe(false);
    expect(
      runDetailSchema.safeParse({
        ...runFixtures[0],
        steps: [{ ...runFixtures[0].steps[0], status: "waiting_for_approval" }],
      }).success,
    ).toBe(false);
  });

  it("rejects malformed or duplicate action references", () => {
    expect(
      runDetailSchema.safeParse({
        ...runFixtures[0],
        actionIds: ["act_0002", "act_0002"],
      }).success,
    ).toBe(false);
    expect(
      runDetailSchema.safeParse({
        ...runFixtures[0],
        actionIds: ["../other"],
      }).success,
    ).toBe(false);
  });

  it("accepts only scoped, supported stream recovery controls", () => {
    expect(
      runStreamRecoverySchema.safeParse({
        runId: "run_0100",
        reason: "cursor-expired",
      }).success,
    ).toBe(true);
    expect(
      runStreamRecoverySchema.safeParse({
        runId: "run_0100",
        reason: "cursor-expired",
        token: "secret",
      }).success,
    ).toBe(false);
    expect(
      runStreamRecoverySchema.safeParse({
        runId: "other",
        reason: "unknown",
      }).success,
    ).toBe(false);
  });

  it("rejects snapshot events that belong to a different run", () => {
    const run = runFixtures[0];
    expect(
      runDetailSchema.safeParse({
        ...run,
        events: [{ ...run.events[0], runId: "run_0101" }],
      }).success,
    ).toBe(false);
  });
});
