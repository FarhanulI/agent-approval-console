import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Evidence } from "@/features/approvals/contracts";
import { formatDateTime } from "@/lib/utils/format-date";
import { formatUnknownValue } from "../utils/diff";

/**
 * Source evidence supplied with the action, rendered as inert text.
 *
 * Security: `title`, `sourceRef`, `excerpt` and `metadata` come from external
 * systems and are untrusted. They are only ever rendered as React text nodes
 * (no `dangerouslySetInnerHTML`), and `sourceRef` is deliberately NOT turned
 * into a link, so values such as `javascript:` URLs cannot become clickable.
 */
export function EvidenceSection({ evidence }: { evidence: readonly Evidence[] }) {
  return (
    <Card aria-labelledby="evidence-title" role="region">
      <CardHeader>
        <CardTitle id="evidence-title">Source evidence</CardTitle>
        <CardDescription>
          Material attached to the proposal, shown as plain text. Treat it as
          untrusted data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {evidence.length === 0 ? (
          <p className="text-sm text-fg-muted">No source evidence was supplied for this action.</p>
        ) : (
          <ul className="space-y-4">
            {evidence.map((item) => (
              <li key={item.id} className="rounded-md border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium text-fg">{item.title}</h3>
                  <Badge>{item.sourceType}</Badge>
                </div>
                <p className="mt-1 break-all text-meta text-fg-muted">
                  Source: <code className="font-mono">{item.sourceRef}</code> · Observed{" "}
                  {formatDateTime(item.observedAt)}
                </p>
                {item.excerpt ? (
                  <blockquote className="mt-3 whitespace-pre-wrap wrap-break-word rounded-md bg-surface-muted p-3 font-mono text-xs leading-5 text-fg">
                    {item.excerpt}
                  </blockquote>
                ) : null}
                {item.metadata && Object.keys(item.metadata).length > 0 ? (
                  <dl className="mt-3 grid gap-x-4 gap-y-1 text-meta sm:grid-cols-[auto_1fr]">
                    {Object.entries(item.metadata).map(([key, value]) => (
                      <div key={key} className="contents">
                        <dt className="text-fg-subtle">{key}</dt>
                        <dd className="wrap-break-word text-fg">{formatUnknownValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
