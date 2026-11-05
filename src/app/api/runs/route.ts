import { handleListRuns } from "@/features/runs/server/handlers";

export function GET(request: Request) {
  return handleListRuns(request);
}
