import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

type RunPageProps = {
  params: Promise<{ runId: string }>;
};

async function RunRouteContext({ params }: RunPageProps) {
  const { runId } = await params;

  return (
    <p className="text-sm text-fg-muted">
      Run reference: <code className="font-mono text-fg">{runId}</code>. Run
      data and live monitoring are not implemented in this module.
    </p>
  );
}

export default function RunDetailsPage({ params }: RunPageProps) {
  return (
    <>
      <PageHeader
        title="Run details"
        breadcrumbs={[
          { label: "Live runs", href: "/runs" },
          { label: "Run details" },
        ]}
        description="This route reserves space for future agent run monitoring."
      />
      <Suspense fallback={<Skeleton className="h-14 w-full" />}>
        <RunRouteContext params={params} />
      </Suspense>
    </>
  );
}