import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-3xl px-4 py-12 focus:outline-none sm:px-6"
    >
      <EmptyState
        title="Page not found"
        description="The requested route does not exist in this console."
        action={
          <Link
            className="rounded-md px-3 py-2 text-sm font-medium text-accent underline underline-offset-4"
            href="/approvals"
          >
            Go to approvals
          </Link>
        }
      />
    </main>
  );
}