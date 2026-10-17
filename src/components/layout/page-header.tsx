import type { ReactNode } from "react";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";

export type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: readonly BreadcrumbItem[];
  actions?: ReactNode;
};

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {breadcrumbs?.length ? <Breadcrumb items={breadcrumbs} /> : null}
        <div className="space-y-1">
          <h1 className="text-title text-fg">{title}</h1>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
