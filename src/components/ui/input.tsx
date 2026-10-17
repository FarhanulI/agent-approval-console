import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

export type InputProps = ComponentProps<"input"> & {
  invalid?: boolean;
};

export function Input({
  className,
  invalid = false,
  "aria-invalid": ariaInvalid,
  ...props
}: InputProps) {
  return (
    <input
      className={cn(
        "min-h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-fg placeholder:text-fg-subtle disabled:bg-surface-muted disabled:opacity-70",
        invalid && "border-danger",
        className,
      )}
      aria-invalid={invalid || ariaInvalid || undefined}
      {...props}
    />
  );
}