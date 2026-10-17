import Link from "next/link";

export function ProductMark() {
  return (
    <Link className="flex items-center gap-3 rounded-md" href="/approvals">
      <span
        aria-hidden="true"
        className="flex size-9 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-fg"
      >
        AC
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-fg">
          Agent Approval Console
        </span>
        <span className="block text-xs leading-5 text-fg-muted">
          Human-supervised actions
        </span>
      </span>
    </Link>
  );
}
