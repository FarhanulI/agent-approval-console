import type { SVGProps } from "react";
import type { NavigationItem } from "./navigation";

function BaseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      {...props}
    />
  );
}

export function NavIcon({ name }: { name: NavigationItem["icon"] }) {
  switch (name) {
    case "approvals":
      return (
        <BaseIcon>
          <path d="M9 11.5 11 13.5 15.5 9" />
          <path d="M5 4h14v16H5z" />
        </BaseIcon>
      );
    case "runs":
      return (
        <BaseIcon>
          <path d="M3 12h4l2.5-6 5 12L17 12h4" />
        </BaseIcon>
      );
    case "audit":
      return (
        <BaseIcon>
          <path d="M7 4h10v16H7z" />
          <path d="M10 9h4M10 13h4M10 17h2" />
        </BaseIcon>
      );
  }
}

export function MenuIcon() {
  return (
    <BaseIcon>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </BaseIcon>
  );
}

export function CloseIcon() {
  return (
    <BaseIcon>
      <path d="m6 6 12 12M18 6 6 18" />
    </BaseIcon>
  );
}
