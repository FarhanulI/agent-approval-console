import type { ApiScalarValue, RecordChange } from "@/features/approvals/contracts";

/**
 * A side of a diff. `absent` means the payload did not include the key (the
 * value is UNKNOWN); it is not the same as a present `null` (a known empty
 * value). Keeping them apart prevents unknown values being shown as `null`.
 */
export type DiffValue =
  | { state: "absent" }
  | { state: "present"; value: ApiScalarValue };

/**
 * - `changed`: both sides known and different.
 * - `unchanged`: both sides known and equal (deep equality; `null` = `null`).
 * - `added`: the existing value is known to be empty (`null`) and a value is proposed.
 * - `removed`: a known value is proposed to become empty (`null`).
 * - `before-unknown`: only the proposed value was supplied.
 * - `after-unknown`: only the existing value was supplied.
 * - `unknown`: neither side was supplied; no diff can be computed.
 */
export type DiffKind =
  | "changed"
  | "unchanged"
  | "added"
  | "removed"
  | "before-unknown"
  | "after-unknown"
  | "unknown";

export type DiffRow = {
  field: string;
  label: string;
  kind: DiffKind;
  before: DiffValue;
  after: DiffValue;
};

function toDiffValue(value: ApiScalarValue | undefined): DiffValue {
  return value === undefined ? { state: "absent" } : { state: "present", value };
}

/** Key-order-independent serialisation used only for equality. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  // JSON keeps `5` and `"5"` distinct, so type changes count as changes.
  return JSON.stringify(value) ?? "undefined";
}

function classify(before: DiffValue, after: DiffValue): DiffKind {
  if (before.state === "absent" && after.state === "absent") return "unknown";
  if (before.state === "absent") return "before-unknown";
  if (after.state === "absent") return "after-unknown";
  if (canonical(before.value) === canonical(after.value)) return "unchanged";
  if (before.value === null) return "added";
  if (after.value === null) return "removed";
  return "changed";
}

/**
 * Classifies each supplied record change. Pure; preserves input order. It does
 * not infer anything the payload does not state: a missing side is reported as
 * unknown, never defaulted to `null`.
 */
export function computeRecordDiff(changes: readonly RecordChange[]): DiffRow[] {
  return changes.map((change) => {
    const before = toDiffValue(change.before);
    const after = toDiffValue(change.after);
    return {
      field: change.field,
      label: change.label,
      kind: classify(before, after),
      before,
      after,
    };
  });
}

export type FormattedValue = {
  /** Plain text. Must be rendered as a React text node, never as HTML. */
  text: string;
  tone: "absent" | "null" | "empty-string" | "text" | "structured";
};

/** Presentation text for one side; the `tone` keeps null/absent/"" visibly distinct. */
export function formatDiffValue(value: DiffValue): FormattedValue {
  if (value.state === "absent") return { text: "Not provided", tone: "absent" };
  const raw = value.value;
  if (raw === null) return { text: "null", tone: "null" };
  if (typeof raw === "string") {
    return raw === ""
      ? { text: "(empty string)", tone: "empty-string" }
      : { text: raw, tone: "text" };
  }
  if (typeof raw === "object") {
    return { text: JSON.stringify(raw, null, 2), tone: "structured" };
  }
  return { text: String(raw), tone: "text" };
}

export const diffKindLabels: Record<DiffKind, string> = {
  changed: "Changed",
  unchanged: "Unchanged",
  added: "Added",
  removed: "Removed",
  "before-unknown": "Existing value not provided",
  "after-unknown": "Proposed value not provided",
  unknown: "Cannot be compared",
};

/** Formats an arbitrary untrusted JSON value (e.g. evidence metadata) as text. */
export function formatUnknownValue(value: unknown): string {
  return formatDiffValue({ state: "present", value: value as ApiScalarValue }).text;
}
