import { describe, expect, it } from "vitest";
import {
  bulkDecisionRequestSchema,
  bulkDecisionResultSchema,
  MAX_BULK_DECISIONS,
} from "./bulk-decision";

const requestItem = (overrides: Record<string, unknown> = {}) => ({
  actionId: "act_0001",
  decision: "approve",
  recordVersion: 1,
  idempotencyKey: "bulk-key-000000000001",
  ...overrides,
});

describe("bulk decision schemas", () => {
  it("accepts a strict per-item request without actor or tenant claims", () => {
    expect(
      bulkDecisionRequestSchema.parse({
        decisions: [requestItem()],
      }),
    ).toMatchObject({
      decisions: [{ actionId: "act_0001", decision: "approve" }],
    });
    expect(
      bulkDecisionRequestSchema.safeParse({
        decisions: [requestItem({ actorId: "untrusted" })],
      }).success,
    ).toBe(false);
  });

  it("rejects empty/oversized batches, duplicate actions, and shared keys", () => {
    expect(bulkDecisionRequestSchema.safeParse({ decisions: [] }).success).toBe(false);
    expect(
      bulkDecisionRequestSchema.safeParse({
        decisions: Array.from({ length: MAX_BULK_DECISIONS + 1 }, (_, index) =>
          requestItem({
            actionId: `act_${index}`,
            idempotencyKey: `bulk-key-${String(index).padStart(12, "0")}`,
          }),
        ),
      }).success,
    ).toBe(false);
    expect(
      bulkDecisionRequestSchema.safeParse({
        decisions: [requestItem(), requestItem({ idempotencyKey: "bulk-key-000000000002" })],
      }).success,
    ).toBe(false);
    expect(
      bulkDecisionRequestSchema.safeParse({
        decisions: [
          requestItem(),
          requestItem({
            actionId: "act_0002",
          }),
        ],
      }).success,
    ).toBe(false);
  });

  it("validates all per-item outcomes and requires success status", () => {
    const outcomes = [
      "approved",
      "rejected",
      "conflict",
      "forbidden",
      "failed",
      "outcome_unknown",
    ] as const;
    for (const outcome of outcomes) {
      const item =
        outcome === "approved" || outcome === "rejected"
          ? {
              actionId: `act_${outcome}`,
              decision: outcome === "approved" ? "approve" : "reject",
              outcome,
              status: outcome,
              recordVersion: 2,
              message: "Confirmed.",
            }
          : {
              actionId: `act_${outcome}`,
              decision: "approve",
              outcome,
              message: "Not confirmed.",
            };
      expect(bulkDecisionResultSchema.safeParse({ results: [item] }).success).toBe(true);
    }

    expect(
      bulkDecisionResultSchema.safeParse({
        results: [
          {
            actionId: "act_0001",
            decision: "approve",
            outcome: "approved",
            message: "Missing status.",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      bulkDecisionResultSchema.safeParse({
        results: [
          {
            actionId: "act_0001",
            decision: "approve",
            outcome: "failed",
            status: "approved",
            message: "Contradictory status.",
          },
        ],
      }).success,
    ).toBe(false);
  });
});
