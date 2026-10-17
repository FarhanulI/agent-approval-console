import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review proposed agent actions before they can proceed."
      />
      <EmptyState
        title="Approval queue is not implemented yet"
        description="The queue, action data, and decision workflow will be added in later modules. No agent actions are being loaded here."
      />
    </>
  );
}