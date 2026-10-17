import Link from "next/link";

export type BreadcrumbItem = { label: string; href?: string };

/** The last item is the current page and is rendered without a link. */
export function Breadcrumb({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li className="flex items-center gap-2" key={`${item.label}-${index}`}>
              {isCurrent || !item.href ? (
                <span aria-current={isCurrent ? "page" : undefined}>
                  {item.label}
                </span>
              ) : (
                <Link
                  className="rounded-sm underline-offset-4 hover:text-fg hover:underline"
                  href={item.href}
                >
                  {item.label}
                </Link>
              )}
              {isCurrent ? null : (
                <span aria-hidden="true" className="text-fg-subtle">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
