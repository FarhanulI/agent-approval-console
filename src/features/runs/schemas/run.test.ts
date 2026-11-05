import { describe, expect, it } from "vitest";
import { runFixtures } from "@/mocks/fixtures/runs";
import { runDetailSchema, runEventSchema } from "./run";

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
});
