import { PageHeader } from "@/components/layout/page-header";
import { RunList } from "@/features/runs/components/run-list";

export default function RunsPage() {
  return (
    <>
      <PageHeader
        title="Live runs"
        description="Monitor agent runs as they progress."
      />
      <RunList />
    </>
  );
}
