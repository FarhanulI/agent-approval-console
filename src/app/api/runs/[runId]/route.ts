import { handleGetRun } from "@/features/runs/server/handlers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  return handleGetRun(request, (await params).runId);
}
