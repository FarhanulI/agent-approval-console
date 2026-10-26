import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionDetail } from "@/features/action-details/components/action-detail";

type ActionPageProps = {
  params: Promise<{ actionId: string }>;
};

/** Awaits the dynamic route param and hands it to the client container. */
async function ActionRouteContent({ params }: ActionPageProps) {
  const { actionId } = await params;
  return <ActionDetail actionId={actionId} />;
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
        description="Review the agent's proposal, its evidence and the proposed record changes before deciding."
      />
      <Suspense fallback={<Skeleton className="h-14 w-full" />}>
        <ActionRouteContent params={params} />
      </Suspense>
    </>
  );
}
