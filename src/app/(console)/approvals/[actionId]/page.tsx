import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";

type ActionPageProps = {
  params: Promise<{ actionId: string }>;
};

async function ActionRouteContext({ params }: ActionPageProps) {
  const { actionId } = await params;

  return (
    <p className="text-sm text-fg-muted">
      Action reference: <code className="font-mono text-fg">{actionId}</code>.
      Action data and decision controls are not implemented in this module.
    </p>
  );
}

export default function ActionDetailsPage({ params }: ActionPageProps) {
  return (
    <>
      <PageHeader
        title="Action details"
        breadcrumbs={[
          { label: "Approvals", href: "/approvals" },
          { label: "Action details" },
        ]}
        description="This route reserves space for a future human review workflow."
      />
      <Suspense fallback={<Skeleton className="h-14 w-full" />}>
        <ActionRouteContext params={params} />
      </Suspense>
    </>
  );
}