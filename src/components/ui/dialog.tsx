"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeOnBackdrop = true,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ignoreCloseRef = useRef(false);
  const notifiedCloseRef = useRef(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      notifiedCloseRef.current = false;
      dialog.showModal();
    } else if (!open && dialog.open) {
      ignoreCloseRef.current = true;
      dialog.close();
    }
  }, [open]);

  function handleClose() {
    if (ignoreCloseRef.current) {
      ignoreCloseRef.current = false;
      return;
    }

    if (!notifiedCloseRef.current) {
      notifiedCloseRef.current = true;
      onClose();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-auto rounded-lg border border-line bg-surface p-0 text-fg shadow-xl backdrop:bg-black/50",
      )}
      onClose={handleClose}
      onClick={(event) => {
        if (
          closeOnBackdrop &&
          event.target === event.currentTarget &&
          dialogRef.current?.open
        ) {
          dialogRef.current.close();
        }
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="space-y-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-sm leading-6 text-fg-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button
          aria-label="Close dialog"
          className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-surface-muted hover:text-fg"
          onClick={() => dialogRef.current?.close()}
          type="button"
        >
          Close
        </button>
      </div>
      <div className="p-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap justify-end gap-3 border-t border-line px-5 py-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}