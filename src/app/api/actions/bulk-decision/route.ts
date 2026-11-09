import { handleBulkDecision } from "@/features/approvals/server/handlers";

export async function POST(request: Request) {
  return handleBulkDecision(request);
}
