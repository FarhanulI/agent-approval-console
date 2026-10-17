import { Suspense } from "react";
import { NavLinks, NavLinksFallback } from "./nav-links";
import { ProductMark } from "./product-mark";

export function Sidebar() {
  return (
    <aside className="hidden border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
      <div className="p-5">
        <ProductMark />
      </div>
      <div className="px-3">
        <Suspense fallback={<NavLinksFallback />}>
          <NavLinks />
        </Suspense>
      </div>
      <p className="mt-auto px-5 py-5 text-xs leading-5 text-fg-subtle">
        Human review for agent-proposed actions.
      </p>
    </aside>
  );
}
