import { NextResponse } from "next/server";
import { env } from "@/lib/config/env";
import type { ApiErrorResponse } from "@/features/approvals/contracts";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Propagates a well-formed inbound `x-request-id`, otherwise generates one. */
export function getRequestId(request: Request): string {
  const inbound = request.headers.get("x-request-id");
  return inbound && REQUEST_ID_PATTERN.test(inbound)
    ? inbound
    : `req_${crypto.randomUUID()}`;
}

/** Authenticated responses must never be cached by browsers or shared caches. */
const NO_STORE = { "cache-control": "no-store", vary: "cookie" } as const;

export function jsonResponse(
  body: unknown,
  requestId: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): NextResponse {
  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: { ...NO_STORE, "x-request-id": requestId, ...init.headers },
  });
}

/**
 * Structured error in the existing `ApiErrorResponse` envelope. Messages are
 * fixed strings chosen by callers; never pass session data, stack traces or
 * backend internals.
 */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): NextResponse {
  const body: ApiErrorResponse = {
    error: { code, message, requestId, ...(details ? { details } : {}) },
  };
  return jsonResponse(body, requestId, { status });
}

export const unauthenticated = (requestId: string) =>
  errorResponse(401, "unauthenticated", "Authentication is required.", requestId);

export const forbidden = (requestId: string) =>
  errorResponse(403, "forbidden", "You are not permitted to perform this operation.", requestId);

/** Also used for cross-tenant resources, so existence is not revealed. */
export const notFound = (requestId: string) =>
  errorResponse(404, "not_found", "Action not found.", requestId);

/**
 * CSRF defense for state-changing requests, layered on top of the SameSite=Lax
 * session cookie (which alone is not treated as sufficient): the `Origin`
 * header must be present and equal to this app's origin (the configured
 * `APP_URL` or the request's own origin). A missing Origin is rejected, which
 * fails closed for non-browser callers. Limitation: relies on browsers
 * sending a truthful Origin header.
 */
export function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set<string>([new URL(env.APP_URL).origin]);
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    // only APP_URL is trusted
  }
  return allowed.has(origin);
}

export function isJsonRequest(request: Request): boolean {
  return (request.headers.get("content-type") ?? "")
    .toLowerCase()
    .startsWith("application/json");
}

export type BoundedBodyResult =
  | { ok: true; text: string }
  | { ok: false; reason: "too_large" | "unreadable" };

/** Reads at most `maxBytes` from an untrusted request body. */
export async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    await request.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, text };
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: "unreadable" };
  } finally {
    reader.releaseLock();
  }
}

export function tooManyRequests(requestId: string, retryAfterSeconds: number) {
  const response = errorResponse(
    429,
    "rate_limited",
    "Too many requests. Please try again later.",
    requestId,
  );
  response.headers.set("retry-after", String(retryAfterSeconds));
  return response;
}
