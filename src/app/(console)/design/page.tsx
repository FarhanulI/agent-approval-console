import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Select,
  Skeleton,
} from "@/components/ui";
import { DialogDemo } from "@/components/ui/dialog-demo";

export const metadata: Metadata = {
  title: "Design preview",
};

export default function DesignPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <PageHeader
        title="Design preview"
        description="Temporary development preview of the shared foundation primitives."
        actions={<Badge tone="warning">Temporary dev tool</Badge>}
      />

      <div className="space-y-8">
        <section aria-labelledby="button-preview" className="space-y-3">
          <h2 id="button-preview" className="text-base font-semibold">
            Buttons
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button size="sm" variant="secondary">
              Secondary small
            </Button>
            <Button size="lg" variant="ghost">
              Ghost large
            </Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
          </div>
        </section>

        <section aria-labelledby="badge-preview" className="space-y-3">
          <h2 id="badge-preview" className="text-base font-semibold">
            Badges
          </h2>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">Neutral</Badge>
            <Badge tone="info">Info</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="danger">Danger</Badge>
            <Badge tone="accent">Accent</Badge>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Card composition</CardTitle>
            <CardDescription>
              A panel built from composable header, content, and footer parts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm font-medium">
                <span>Record name</span>
                <Input placeholder="Example record" />
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Review status</span>
                <Select defaultValue="pending">
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                </Select>
              </label>
            </div>
            <div className="mt-5 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          </CardContent>
          <CardFooter>
            <span className="text-sm text-fg-muted">Panel footer</span>
          </CardFooter>
        </Card>

        <section aria-labelledby="feedback-preview" className="space-y-4">
          <h2 id="feedback-preview" className="text-base font-semibold">
            Feedback states
          </h2>
          <EmptyState
            title="No records in this preview"
            description="EmptyState can present concise context without implying data has loaded."
          />
          <ErrorState
            title="Example error state"
            description="This preview demonstrates the alert role and request correlation ID."
            requestId="demo-request-001"
          />
        </section>

        <section aria-labelledby="dialog-preview" className="space-y-3">
          <h2 id="dialog-preview" className="text-base font-semibold">
            Dialog
          </h2>
          <DialogDemo />
        </section>
      </div>
    </>
  );
}