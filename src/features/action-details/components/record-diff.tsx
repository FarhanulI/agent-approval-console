import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecordChange } from "@/features/approvals/contracts";
import {
  computeRecordDiff,
  diffKindLabels,
  formatDiffValue,
  type DiffKind,
  type DiffValue,
} from "../utils/diff";

const kindTones: Record<DiffKind, "neutral" | "info" | "success" | "warning" | "danger"> = {
  changed: "info",
  unchanged: "neutral",
  added: "success",
  removed: "danger",
  "before-unknown": "warning",
  "after-unknown": "warning",
  unknown: "warning",
};

function Value({ value }: { value: DiffValue }) {
  const { text, tone } = formatDiffValue(value);
  if (tone === "structured") {
    return (
      <pre className="whitespace-pre-wrap wrap-break-word font-mono text-xs text-fg">{text}</pre>
    );
  }
  return (
    <span
      // absent / null / empty string are italic so they cannot be mistaken for real text
      className={tone === "text" ? "wrap-break-word text-fg" : "italic text-fg-muted"}
      data-value-tone={tone}
    >
      {text}
    </span>
  );
}

/**
 * Before/after table for the supplied record changes. The text label in the
 * last column carries the meaning of each row (colour only reinforces it).
 * Absent values ("Not provided") are shown differently from `null`, and rows
 * that cannot be compared say so instead of guessing. All values are rendered
 * as text.
 */
export function RecordDiff({ changes }: { changes: readonly RecordChange[] }) {
  const rows = computeRecordDiff(changes);
  const hasGaps = rows.some(
    (row) =>
      row.kind === "before-unknown" || row.kind === "after-unknown" || row.kind === "unknown",
  );

  return (
    <Card aria-labelledby="diff-title" role="region">
      <CardHeader>
        <CardTitle id="diff-title">Proposed record changes</CardTitle>
        <CardDescription>Existing and proposed values as supplied with the action.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-fg-muted">No record changes were supplied for this action.</p>
        ) : (
          <>
            {hasGaps ? (
              <p className="mb-3 text-sm text-fg-muted">
                Some values were not provided, so those rows are not full comparisons.
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                <caption className="sr-only">Before and after values per field</caption>
                <thead>
                  <tr className="border-b border-line text-meta text-fg-subtle">
                    <th scope="col" className="py-2 pr-4 font-medium">Field</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Before</th>
                    <th scope="col" className="py-2 pr-4 font-medium">After</th>
                    <th scope="col" className="py-2 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.field} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="py-3 pr-4 font-medium text-fg">
                        {row.label}
                        <span className="block font-mono text-meta font-normal text-fg-subtle">
                          {row.field}
                        </span>
                      </th>
                      <td className="py-3 pr-4"><Value value={row.before} /></td>
                      <td className="py-3 pr-4"><Value value={row.after} /></td>
                      <td className="py-3">
                        <Badge tone={kindTones[row.kind]}>{diffKindLabels[row.kind]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
