import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export type SelectProps = ComponentProps<"select"> & {
  invalid?: boolean;
};

export function Select({
  className,
  invalid = false,
  "aria-invalid": ariaInvalid,
  ...props
}: SelectProps) {
  return (
    <select
      className={cn(
        "min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg disabled:bg-surface-muted disabled:opacity-70",
        invalid && "border-danger",
        className,
      )}
      aria-invalid={invalid || ariaInvalid || undefined}
      {...props}
    />
  );
}