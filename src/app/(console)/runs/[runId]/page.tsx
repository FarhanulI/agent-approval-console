import { PageHeader } from "@/components/layout/page-header";
import { RunDetailView } from "@/features/runs/components/run-detail-view";

type RunPageProps = {
  params: Promise<{ runId: string }>;
};

export default async function RunDetailsPage({ params }: RunPageProps) {
  const { runId } = await params;
  return (
    <>
      <PageHeader
        title="Run details"
        breadcrumbs={[
          { label: "Live runs", href: "/runs" },
          { label: runId },
        ]}
        description="Inspect the run snapshot and its ordered execution events."
      />
      <RunDetailView runId={runId} />
    </>
  );
}