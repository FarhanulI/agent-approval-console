import { describe, expect, it } from "vitest";
import { getDecisionEligibility } from "./decision-eligibility";

describe("decision eligibility role hint (UI only, AUTHZ-001)", () => {
  it("hides decisions for a read-only role but defaults to offering them", () => {
    expect(getDecisionEligibility("pending", true, false)).toMatchObject({
      canDecide: false,
      reason: "role-read-only",
    });
    expect(getDecisionEligibility("pending", true)).toEqual({ canDecide: true });
  });
});
