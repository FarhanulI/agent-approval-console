import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function AuditPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Review a durable history of decisions and system activity."
      />
      <EmptyState
        title="Audit history is not implemented yet"
        description="Audit events, search, and filters will be added in a later module. No activity data is being loaded here."
      />
    </>
  );
}