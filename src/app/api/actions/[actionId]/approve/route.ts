import { handleDecision } from "@/features/approvals/server/handlers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> },
) {
  return handleDecision(request, (await params).actionId, "approve");
}
