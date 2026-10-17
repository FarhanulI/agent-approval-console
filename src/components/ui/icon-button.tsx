import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

export type IconButtonProps = Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "loading"
> & {
  /** Required accessible name; icon-only controls have no visible text. */
  label: string;
};

export function IconButton({
  className,
  label,
  size = "md",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      className={cn("shrink-0 px-0", size === "sm" ? "size-8" : "size-10", className)}
      size={size}
      variant={variant}
      {...props}
    />
  );
}
