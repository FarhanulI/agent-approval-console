import type { ReactNode } from "react";

export type ErrorStateProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  requestId?: string;
};

export function ErrorState({
  title = "Something went wrong",
  description = "The page could not be displayed. Try again, or contact your administrator if the problem continues.",
  action,
  requestId,
}: ErrorStateProps) {
  return (
    <section
      role="alert"
      className="rounded-lg border border-danger-soft bg-surface px-6 py-8"
    >
      <h2 className="text-heading text-fg">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-fg-muted">{description}</p>
      {requestId ? (
        <p className="mt-4 text-meta text-fg-subtle">
          Request ID: <code className="font-mono">{requestId}</code>
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </section>
  );
}