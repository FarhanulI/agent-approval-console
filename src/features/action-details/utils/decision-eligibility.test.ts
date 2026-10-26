import { describe, expect, it } from "vitest";
import { approvalStatusSchema } from "@/features/approvals/contracts";
import { describeStatus, getDecisionEligibility } from "./decision-eligibility";

// Covers DECISION-001.
describe("getDecisionEligibility", () => {
  it("allows only pending actions when decisions are enabled", () => {
    for (const status of approvalStatusSchema.options) {
      const result = getDecisionEligibility(status, true);
      expect(result.canDecide).toBe(status === "pending");
    }
  });

  it("reports why a non-pending action is not eligible", () => {
    const result = getDecisionEligibility("approved", true);
    expect(result).toMatchObject({ canDecide: false, reason: "status-not-pending" });
  });

  it("never allows decisions when they are unavailable, even for pending actions", () => {
    expect(getDecisionEligibility("pending", false)).toMatchObject({
      canDecide: false,
      reason: "decisions-unavailable",
    });
  });
});

describe("describeStatus", () => {
  it("keeps approval separate from execution", () => {
    expect(describeStatus("approved")).toMatch(/not execution/i);
    expect(describeStatus("pending")).toBeUndefined();
  });
});
