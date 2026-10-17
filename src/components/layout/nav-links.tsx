"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { NavIcon } from "./nav-icons";
import { getNavigationState, primaryNavigation } from "./navigation";

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary">
      <ul className="space-y-1">
        {primaryNavigation.map(({ href, label, icon }) => {
          const state = getNavigationState(pathname, href);

          return (
            <li key={href}>
              <Link
                aria-current={state ?? undefined}
                className={cn(
                  "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                  state
                    ? "bg-accent-soft text-accent-soft-fg"
                    : "text-fg-muted hover:bg-surface-muted hover:text-fg",
                )}
                href={href}
                onClick={onNavigate}
              >
                <NavIcon name={icon} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Same links without active state, shown while the pathname resolves. */
export function NavLinksFallback() {
  return (
    <nav aria-label="Primary">
      <ul className="space-y-1">
        {primaryNavigation.map(({ href, label, icon }) => (
          <li key={href}>
            <Link
              className="flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-fg-muted"
              href={href}
            >
              <NavIcon name={icon} />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
