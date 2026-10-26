import { handleGetAction } from "@/features/approvals/server/handlers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> },
) {
  return handleGetAction(request, (await params).actionId);
}
