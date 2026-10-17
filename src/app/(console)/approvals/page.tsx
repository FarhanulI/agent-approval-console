import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/ui/loading-state";
import { PendingActionsQueue } from "@/features/approvals/components/pending-actions-queue";

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Pending Actions"
        description="Review what AI agents propose to change, inspect the evidence, and decide which actions may proceed."
      />
      {/* The queue reads URL search params, which requires a Suspense boundary. */}
      <Suspense fallback={<LoadingState label="Loading pending actions" />}>
        <PendingActionsQueue />
      </Suspense>
    </>
  );
}
