export type NavigationItem = {
  href: string;
  label: string;
  icon: "approvals" | "runs" | "audit";
};

export const primaryNavigation: readonly NavigationItem[] = [
  { href: "/approvals", label: "Approvals", icon: "approvals" },
  { href: "/runs", label: "Live runs", icon: "runs" },
  { href: "/audit", label: "Audit log", icon: "audit" },
];

/**
 * Matches whole path segments, so `/approvals/123` belongs to `/approvals`
 * while `/approvals-archive` does not.
 */
export function getNavigationState(
  pathname: string,
  href: string,
): "page" | "location" | null {
  if (pathname === href) return "page";
  return pathname.startsWith(`${href}/`) ? "location" : null;
}
