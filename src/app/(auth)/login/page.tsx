import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function LoginPage() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-2xl px-4 py-10 focus:outline-none sm:px-6 sm:py-16"
    >
      <PageHeader
        title="Sign in"
        description="Access to the supervision console is controlled by authentication."
      />
      <EmptyState
        title="Authentication is not configured yet"
        description="Sign-in and authorization will be implemented in a later module. No credentials are requested or stored here."
      />
    </main>
  );
}