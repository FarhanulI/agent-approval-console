import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Live runs"
        description="Monitor agent runs as they progress."
      />
      <EmptyState
        title="Run monitoring is not implemented yet"
        description="Run state and the live event timeline will be added in a later module. No run data is being loaded here."
      />
    </>
  );
}
