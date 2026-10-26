import { describe, expect, it } from "vitest";
import { computeRecordDiff, formatDiffValue } from "./diff";

const kindOf = (change: Parameters<typeof computeRecordDiff>[0][number]) =>
  computeRecordDiff([change])[0].kind;

// Covers ACTION-DETAIL-005.
describe("computeRecordDiff", () => {
  it("classifies changed values, including a type change", () => {
    expect(kindOf({ field: "f", label: "F", before: 1, after: 2 })).toBe("changed");
    expect(kindOf({ field: "f", label: "F", before: "5", after: 5 })).toBe("changed");
  });

  it("classifies equal values as unchanged, including null = null and deep equality", () => {
    expect(kindOf({ field: "f", label: "F", before: "a", after: "a" })).toBe("unchanged");
    expect(kindOf({ field: "f", label: "F", before: null, after: null })).toBe("unchanged");
    expect(
      kindOf({ field: "f", label: "F", before: { a: 1, b: [1] }, after: { b: [1], a: 1 } }),
    ).toBe("unchanged");
    expect(kindOf({ field: "f", label: "F", before: [1], after: [1, 2] })).toBe("changed");
  });

  it("treats null -> value as added and value -> null as removed", () => {
    expect(kindOf({ field: "f", label: "F", before: null, after: "x" })).toBe("added");
    expect(kindOf({ field: "f", label: "F", before: "x", after: null })).toBe("removed");
  });

  it("keeps an absent side distinct from null", () => {
    expect(kindOf({ field: "f", label: "F", after: "x" })).toBe("before-unknown");
    expect(kindOf({ field: "f", label: "F", before: "x" })).toBe("after-unknown");
    expect(kindOf({ field: "f", label: "F" })).toBe("unknown");
    // A missing "after" is not a removal: that requires an explicit null.
    expect(kindOf({ field: "f", label: "F", before: "x" })).not.toBe("removed");
  });

  it("treats false, 0 and empty string as known values", () => {
    expect(kindOf({ field: "f", label: "F", before: false, after: true })).toBe("changed");
    expect(kindOf({ field: "f", label: "F", before: 0, after: 1 })).toBe("changed");
    expect(kindOf({ field: "f", label: "F", before: "", after: "x" })).toBe("changed");
  });

  it("preserves order and returns an empty list for no changes", () => {
    const rows = computeRecordDiff([
      { field: "b", label: "B", before: 1, after: 2 },
      { field: "a", label: "A", before: 1, after: 2 },
    ]);
    expect(rows.map((row) => row.field)).toEqual(["b", "a"]);
    expect(computeRecordDiff([])).toEqual([]);
  });
});

describe("formatDiffValue", () => {
  it("distinguishes absent, null and empty string", () => {
    expect(formatDiffValue({ state: "absent" })).toEqual({ text: "Not provided", tone: "absent" });
    expect(formatDiffValue({ state: "present", value: null })).toEqual({ text: "null", tone: "null" });
    expect(formatDiffValue({ state: "present", value: "" })).toEqual({
      text: "(empty string)",
      tone: "empty-string",
    });
  });

  it("returns untrusted strings unchanged (escaping is React's job) and stringifies structures", () => {
    const hostile = "<script>alert(1)</script>";
    expect(formatDiffValue({ state: "present", value: hostile })).toEqual({
      text: hostile,
      tone: "text",
    });
    expect(formatDiffValue({ state: "present", value: 0 }).text).toBe("0");
    expect(formatDiffValue({ state: "present", value: false }).text).toBe("false");
    expect(formatDiffValue({ state: "present", value: { a: 1 } }).tone).toBe("structured");
  });
});
