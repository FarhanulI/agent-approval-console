import { getRequestId, jsonResponse } from "@/lib/server/http";

export function GET(request: Request) {
  return jsonResponse({ status: "ok" }, getRequestId(request));
}
