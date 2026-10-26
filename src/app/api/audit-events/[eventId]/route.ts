import { handleGetAuditEvent } from "@/features/audit/server/handlers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  return handleGetAuditEvent(request, (await params).eventId);
}
