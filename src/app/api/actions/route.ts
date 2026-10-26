import { handleListActions } from "@/features/approvals/server/handlers";

export function GET(request: Request) {
  return handleListActions(request);
}
