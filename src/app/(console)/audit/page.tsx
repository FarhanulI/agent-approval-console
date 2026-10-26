import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/ui/loading-state";
import { AuditLog } from "@/features/audit/components/audit-log";

export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Search the history of decisions and system activity. Events are read-only here."
      />
      {/* The log reads URL search params, which requires a Suspense boundary. */}
      <Suspense fallback={<LoadingState label="Loading audit events" />}>
        <AuditLog />
      </Suspense>
    </>
  );
}
