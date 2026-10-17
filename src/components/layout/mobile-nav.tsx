"use client";

import { Suspense, useRef, useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { CloseIcon, MenuIcon } from "./nav-icons";
import { NavLinks, NavLinksFallback } from "./nav-links";
import { ProductMark } from "./product-mark";

/**
 * Top bar and drawer for viewports below `md`. The drawer is a native modal
 * `<dialog>`, which provides focus trapping, Escape-to-close and focus
 * restoration to the trigger without extra dependencies.
 */
export function MobileNav() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  function openDrawer() {
    dialogRef.current?.showModal();
    setOpen(true);
  }

  function closeDrawer() {
    dialogRef.current?.close();
  }

  return (
    <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 md:hidden">
      <IconButton
        aria-controls="mobile-navigation"
        aria-expanded={open}
        label="Open navigation menu"
        onClick={openDrawer}
      >
        <MenuIcon />
      </IconButton>
      <ProductMark />

      <dialog
        ref={dialogRef}
        aria-label="Navigation menu"
        className="m-0 mr-auto h-dvh max-h-none w-72 max-w-[85vw] border-r border-line bg-surface p-0 text-fg backdrop:bg-black/50 md:hidden md:backdrop:hidden"
        id="mobile-navigation"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDrawer();
        }}
        onClose={() => setOpen(false)}
      >
        <div className="flex items-center justify-between gap-2 p-4">
          <ProductMark />
          <IconButton label="Close navigation menu" onClick={closeDrawer}>
            <CloseIcon />
          </IconButton>
        </div>
        <div className="px-3">
          <Suspense fallback={<NavLinksFallback />}>
            <NavLinks onNavigate={closeDrawer} />
          </Suspense>
        </div>
      </dialog>
    </header>
  );
}
