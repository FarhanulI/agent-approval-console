import { handleSubscribeRunEvents } from "@/features/runs/server/handlers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  return handleSubscribeRunEvents(request, (await params).runId);
}
