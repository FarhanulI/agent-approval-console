import { handleListAuditEvents } from "@/features/audit/server/handlers";

export function GET(request: Request) {
  return handleListAuditEvents(request);
}
